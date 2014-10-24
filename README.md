Exartu-MongoView
=================

A meteor package to publish docs with it's dependencies to the client.

#Usage


```js

Jobs = new Meteor.Collection('jobs');
Customers = new Meteor.Collection('customers');


if (Meteor.isServer){
    JobView = new Meteor.Collection('JobView', {
        collection: Jobs,
        cursors: function(doc){
           return Customers.find(doc.customer);   //OR

           return [Customers.find(doc.customer),...]; //OR

           return {
             cursor: Customers.find(doc.customer),
             to: 'customers' //the result or the cursor will be published to the client collection with this name
           }

           //OR don't return anything and add cursors like this:
           this.publish({
              cursor: function (doc) {
                if (doc.relatedID) {
                  return Customers.find(doc.customer, { fields: { name: 1 } });
                }
              },
              to: 'customers',
              observedProperties: ['customer'],
              onChange: function (changedProps, oldSelector) {
                  oldSelector._id = changedProps.customer;
                  return Contactables.find(oldSelector, {fields: {'name': 1}});
                }
            });
         }
   });

  Meteor.publish('jobView', function () {
    if (!this.userId)
      return false;
  
    return JobView.find({
      userId: this.userId
    });
  });
}



```
