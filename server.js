/**
 * View Class - Create a view of a mongo collection extending documents with mapped property
 * @param name - name of the view
 * @param options - {
 *                    mapping: {
 *                      key: {
 *                        find: function(document) : Mongo Cursor
 *                        map: function(document) : Object, String, etc
 *                      }
 *                    }
 *                    collection: Mongo.collection
 *                  }
 * @constructor
 */
View = function(name, options){
  var self = this;
  if (!_.isString(name))
    throw new Error('Error instantiating View, expecting name to be a string. found ' + name);
  if (! options || ! options.collection)
    throw new Error('Error instantiating View, options.collection necessary');

  self._name = name;
  self._mapping = options.mapping || {};
  self._collection = options.collection || {};
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
    var self = this, mappedHandlers = {};
    publishName = publishName || self._name;

    //regular publish
    var handler = self._collection.find(cursor._cursorDescription.selector, cursor._cursorDescription.options).observeChanges({
      added: function(id, fields){
        //console.log(publishName+' added', id);
        sub.added(publishName, id, fields);
        //add mapped fields
        mappedHandlers[id] = self._doMappings(id, fields, sub, publishName);
      },
      changed: function(id, fields){
        //todo: it may be necessary to do mappings here?
        sub.changed(publishName, id, fields)
      },
      removed: function (id) {
        sub.removed(publishName, id)
        _.each(mappedHandlers[id], function(handler){
          handler.stop();
        })
      }
    });

    //stop this handlers an all associated handlers on subscription stop
    sub.onStop(function(){
      handler.stop();
      _.each(mappedHandlers, function(handler){
        _.each(handler, function (h) {
          h.stop();
        });
      })
    });
    sub.ready();
  },

  /**
   * Publish the mapping
   * @private
   */
  _doMappings: function (docId, docFields, sub, publishName) {
    var self = this,
      mappedHandlers = [];

    //add the _id to fields so that mapping.find can use it as if it where the document
    docFields._id = docId;

    var publishMapCursor = function (cursor, name) {
      if (! cursor._publishCursor) throw new Error('returned a truthy value which is not a cursor', cursor);
      cursor._publishCursor(sub, name)
    }

    var options = self._mapping(docFields);
    if (!options) return;

    options = _.isArray(options) ? options : [options];
    _.each(options, function(o){
      var cursor = o && o.cursor ? o.cursor : o;
      if (!cursor) return;
      publishMapCursor(cursor, o.name || cursor._cursorDescription.collectionName);
    })

    return mappedHandlers;
  }
});

var mapObject = function(key, map, relatedId, relatedFields, doc){
  relatedFields._id = relatedId;
  var object = {};
  object[key] = _.isFunction(map) ? map(relatedFields, doc) : relatedFields;
  return object;
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
    self.view.publishCursor(this, subscription)
  }
});



