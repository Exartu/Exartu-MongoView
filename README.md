Exartu-MongoView
=================

This EXPERIMENTAL package is an attempt to build a view (like SQL's, but on top of mongo) to be publish down to the client.
The idea is to add properties with info from another collection to the object of this publication (from now on 'mapping')

#Usage


```js

Jobs = new Meteor.Collection('jobs');
Customers = new Meteor.Collection('customer');


if (Meteor.isServer){
    JobView = new Meteor.Collection('JobView', {
        collection: Jobs,
        mapping: {
            customerInfo: {
              find: function(job) {
                return Customers.find(job.customerId,{
                    fields: {
                        'organization.organizationName': 1
                    }
                });
              },
              map: function (doc) {
                if (! doc) return null;

                return {
                  id: doc._id,
                  displayName: doc.organization.organizationName
                };
              }
            }
          }
    })


  Meteor.paginatedPublish(JobView, function () {
    if (!this.userId)
      return false;
  
    return JobView.find({
      userId: this.userId
    });
  });
}

if (Meteor.isClient){
  MyHandler = Meteor.paginatedSubscribe('myCollection');
}


```
# why paginatedPublish?:

Right now this package only works if you use paginatedPublish, we will be working to make it an independent package
