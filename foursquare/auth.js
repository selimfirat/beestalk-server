var core = require("../core");
var ensureAuthenticated = core.ensureAuthenticated;
var createJWT = core.createJWT;
var jwt = core.jwt;
var __ = core.underscore;
var request = core.request;
var config = core.config;
var User = core.User;
var Stalking = core.Stalking;

module.exports = function (req, res) {
    var accessTokenUrl = 'https://foursquare.com/oauth2/access_token';
    var profileUrl = 'https://api.foursquare.com/v2/users/self';
    var formData = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.FOURSQUARE_SECRET,
      redirect_uri: req.body.redirectUri,
      grant_type: 'authorization_code'
    };

    // Step 1. Exchange authorization code for access token.
    request.post({ url: accessTokenUrl, form: formData, json: true }, function(err, response, body) {
      var params = {
        v: '20140806',
        oauth_token: body.access_token
      };

      // Step 2. Retrieve information about the current user.
      request.get({ url: profileUrl, qs: params, json: true }, function(err, response, profile) {
        profile = profile.response.user;

        // Step 3a. Link user accounts.
        if (req.headers.authorization) {
          User.findOne({ foursquare: profile.id }, function(err, existingUser) {
            if (existingUser) {
              return res.status(409).send({ message: 'There is already a Foursquare account that belongs to you' });
            }
            var token = req.headers.authorization.split(' ')[1];
            var payload = jwt.decode(token, config.TOKEN_SECRET);
            User.findById(payload.sub, function(err, user) {
              if (!user) {
                return res.status(400).send({ message: 'User not found' });
              }
              user.foursquare = profile.id;
              user.picture = user.picture || profile.photo.prefix + '300x300' + profile.photo.suffix;
              user.displayName = user.displayName || profile.firstName + ' ' + profile.lastName;
              user.foursquareToken = params.oauth_token;
              user.save(function() {
                var token = createJWT(user);
                res.send({ token: token });
              });

              console.log();
            });
          });
        } else {
          // Step 3b. Create a new user account or return an existing one.
          User.findOne({ foursquare: profile.id }, function(err, existingUser) {
            if (existingUser) {
              var token = createJWT(existingUser);
              return res.send({ token: token });
            }
            var user = new User();
            user.foursquare = profile.id;
            user.picture = profile.photo.prefix + '300x300' + profile.photo.suffix;
            user.displayName = profile.firstName + ' ' + profile.lastName;
            user.foursquareToken = params.oauth_token;
            user.save(function() {
              var token = createJWT(user);
              res.send({ token: token });
            });
          });
        }
      });
    });
}
