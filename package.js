Package.describe({
  summary: "view for mongo",
  name: 'aida:mongo-view',
  version: "0.1.2",
  git: "https://github.com/Exartu/Exartu-MongoView.git"
});

Package.onUse(function (api, where) {
  api.versionsFrom('METEOR@0.9.2');
  api.use('underscore', 'server');

  api.addFiles(['server.js'], 'server');
  api.export('View', 'server');
});

