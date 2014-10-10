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
    var self = this, mappedHandlers;

    //regular publish
    var handler = self._collection.find(cursor._cursorDescription.selector, cursor._cursorDescription.options).observeChanges({
      added: function(id, fields){
        sub.added(publishName, id, fields);
        //add mapped fields
        mappedHandlers = self._doMappings(id, fields, sub, publishName);
      },
      changed: function(id, fields){
        //todo: it may be necessary to do mappings here?
        sub.changed(publishName, id, fields)
      },
      removed: function (id) {
        sub.removed(publishName, id)
      }
    });

    //stop this handlers an all associated handlers on subscription stop
    sub.onStop(function(){
      handler.stop();
      _.each(mappedHandlers, function(handler){
        handler.stop();
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

    //foreach mapping, get the cursor and observe it. Add the mapped fields to the original subscription
    _.each(self._mapping, function(mapping, key){
      var cursor = mapping.find(docFields);
      if (!cursor) return;
      if (! cursor.observeChanges) console.log('cursor', cursor);
      mappedHandlers.push(cursor.observeChanges({
        added: function (relatedId, relatedFields) {
          var value = mapObject(key, mapping.map, relatedId, relatedFields, docFields);
          sub.changed(publishName, docId, value);
        },
        changed: function (relatedId, relatedFields) {
          var value = mapObject(key, mapping.map, relatedId, relatedFields, docFields);
          sub.changed(publishName, docId, value)
        },
        removed: function (relatedId) {
          var object = {};
          object[key] = mapping.map ? mapping.map(null) : null;
          sub.changed(publishName, docId, object);
        }
      }));

    });

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
  }
});



