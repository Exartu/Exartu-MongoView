/**
 * View Class - Create a view of a mongo collection extending documents with mapped property
 * @param name - name of the view
 * @param options - {
 *                    collection: Mongo.collection
 *                    cursors: function(doc){
 *                      return OtherCollection.find(doc.relatedID);   //OR
 *
 *                      return [OtherCollection.find(doc.relatedID),...]; //OR
 *
 *                      return {
 *                        cursor: OtherCollection.find(doc.relatedID),
 *                        to: 'colectionName' //the result or the cursor will be published to the client collection with this name
*                        }
*
*                        //OR don't return anything and add cursors like this:
*                        this.publish({
                          cursor: function (doc) {
                            if (doc.relatedID) {
                              return Contactables.find(doc.relatedID, { fields: { name: 1 } });
                            }
                          },
                          to: 'colectionName',
                          observedProperties: ['relatedID'],
                          onChange: function (changedProps, oldSelector) {
                              oldSelector._id = changedProps.relatedID;
                              return Contactables.find(oldSelector, {fields: {'name': 1}});
                            }
                        });
 *                    }
 *                  }
 * @constructor
 */
View = function(name, options){
  var self = this;
  if (!_.isString(name))
    throw new Error('Error instantiating View, expecting name to be a string. found ' + name);

  if (! options || ! options.collection)
    throw new Error('Error instantiating View ' + name + ', options.collection necessary');

  self._name = name;

  if (options.mapping){
    console.warn('in view ' + name + ' mapping is deprecated, use cursors instead');
  }

  self._cursors = options.cursors || options.mapping || {};

  if (! _.isFunction(self._cursors)){
    throw new Error('cursors (or mapping) must be a function');
  }

  self._collection = options.collection;

  self._mapping = {};
};

_.extend(View.prototype, {
  /**
   * Only returns a ViewCursor DOES NOT intend to be the same than a Mongo collection find yet
   * @returns {ViewCursor}
   */
  find: function(selector, options){
    return new ViewCursor(this, selector, options);
  },

  /**
   * publish a ViewCursor
   */
  publishCursor: function(cursor, sub, publishName){
    var self = this;
    publishName = publishName || self._name;

    // Check if I'm the 'owner' of this sub
    // By owner I mean that this cursor not one of the mapped ones
    // If nobody owned this sub, then I'm the owner
    // If somebody already owned this sub, then I'm a secondary cursor
    // and I shouldn't decide when this sub is ready or not
    var owner = false;
    if (!sub._owned_){
      owner = true;
      sub._owned_ = true;
    }

    //regular publish
    var handler = self._collection.find(cursor._cursorDescription.selector, cursor._cursorDescription.options).observeChanges({
      added: function(id, fields){
        sub.added(publishName, id, fields);

        //add mapped fields
        self._doMappings(id, fields, sub, publishName);
      },
      changed: function(id, fields){
        sub.changed(publishName, id, fields);

        self._reDoMappings(id, fields, sub, publishName);
      },
      removed: function (id) {
        sub.removed(publishName, id);
        //stop all handlers that where related to this document
        _.each(self._mapping[id], function(map){
          map.handler.stop();
        })
      }
    });

    //stop this handlers an all associated handlers on subscription stop
    sub.onStop(function(){
      handler.stop();
      _.each(self._mapping, function(mapings){
        _.each(mapings, function (map) {
          map.handler.stop();
        });
      })
    });

    owner && sub.ready();

    return handler;
  },

  _publishMapCursor: function (cursor, sub, name) {
    if (! cursor._publishCursor) throw new Error(name + ' returned a truthy value which is not a cursor');

    if (cursor instanceof ViewCursor){
      return cursor._publishCursor(sub, name) || {stop: function(){ console.warn('no handler for cursor published to ' + name); }};
    }else{
      return PublishMongoCursor(cursor, sub, name) || {stop: function(){ console.warn('no handler for cursor published to ' + name); }};
    }
  },

  /**
   * Publish the other cursors
   * @private
   */
  _doMappings: function (docId, docFields, sub, publishName) {
    var self = this,
      mappings = [];

    //add the _id to fields so that options.cursors can use it as if it where the document
    docFields._id = docId;

    var options = [];

    // give them the chance to use this.publish to populate options
    // but if the return something truthy I'll use that
    var result = self._cursors.call({
      publish: function (obj) {
        options.push(obj);
      }
    }, docFields);

    result && (options = result);

    if (!options) return;
    options = _.isArray(options) ? options : [options];

    _.each(options, function(res){
      if (!res) return;
      var opt = res.cursor ? res : {
        cursor: res
      };
      opt.to = res.to || opt.cursor._cursorDescription.collectionName;
      opt.observedProperties = res.observedProperties || [];
      opt.onChange = res.onChange || false;

      if (!opt.cursor) return;
      var cursor = opt.cursor;
      opt._cursor = opt.cursor;
      if (_.isFunction(opt.cursor)){
        cursor = opt.cursor(docFields);
        opt._cursor = cursor;
      }

      if (!cursor) return;

      opt.handler = self._publishMapCursor(cursor, sub, opt.to);
      mappings.push(opt);
    });

    self._mapping[docId] = mappings;
    //sub.ready();
  },

  /**
   *
   * @private
   */
  _reDoMappings: function (docId, docFields, sub, publishName) {
    var self = this;

    _.each(match(docFields, self._mapping[docId]), function(opt){
      if (opt.onChange){
        opt.cursor = opt.onChange(docFields, opt._cursor._cursorDescription.selector);

        opt.handler.stop();

        if (opt.cursor){
          opt.handler = self._publishMapCursor(opt.cursor, sub, opt.to);
        }
      }
    })
  }
});
var match = function (fields, mappings) {
 var result = [];
  _.each(_.keys(fields), function (key) {
    _.each(mappings, function (map) {
      if (_.contains(map.observedProperties, key)){
        result.push(map);
      }
    });
  });
  return result;
};
/**
 *
 * @param view
 * @param selector
 * @param options
 * @constructor
 */
ViewCursor = function(view, selector, options){
  var self = this;
  self._cursorDescription = {
    selector: selector || {},
    options: options || {}
  };
  self.view = view;
};

/*
  Add some functions to make the viewCursors work 'like' a mongo cursor. At least from the Pagination package point of view
 */
_.extend(ViewCursor.prototype, {
  observeChanges: function (options) {
    var self = this;
    var cursor = self.view._collection.find(self._cursorDescription.selector, self._cursorDescription.options);
    return cursor.observeChanges(options);
  },
  count: function(){
    var self = this;
    var cursor = self.view._collection.find(self._cursorDescription.selector, self._cursorDescription.options);
    return cursor.count();
  },
  _publishCursor: function (subscription) {
    var self = this;
    return self.view.publishCursor(this, subscription)
  }
});

// equivalent to Mongo._publishCursor but it returns the handler;
PublishMongoCursor = function (cursor, sub, collection) {
  var observeHandle = cursor.observeChanges({
    added: function (id, fields) {
      sub.added(collection, id, fields);
    },
    changed: function (id, fields) {
      sub.changed(collection, id, fields);
    },
    removed: function (id) {
      sub.removed(collection, id);
    }
  });
  sub.onStop(function () {observeHandle.stop();});

  return observeHandle;
};



