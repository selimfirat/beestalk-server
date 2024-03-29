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
    var accessTokenUrl = 'https://api.instagram.com/oauth/access_token';
    var params = {
      client_id: req.body.clientId,
      redirect_uri: req.body.redirectUri,
      client_secret: config.INSTAGRAM_SECRET,
      code: req.body.code,
      grant_type: 'authorization_code'
    };

    // Step 1. Exchange authorization code for access token.
    request.post({ url: accessTokenUrl, form: params, json: true }, function(error, response, body) {

      // Step 2a. Link user accounts.
      if (req.headers.authorization) {
        User.findOne({ instagram: body.user.id }, function(err, existingUser) {
          if (existingUser) {
            return res.status(409).send({ message: 'There is already an Instagram account that belongs to you' });
          }

          var token = req.headers.authorization.split(' ')[1];
          var payload = jwt.decode(token, config.TOKEN_SECRET);

          User.findById(payload.sub, function(err, user) {
            if (!user) {
              return res.status(400).send({ message: 'User not found' });
            }
            user.instagram = body.user.id;
            user.picture = user.picture || body.user.profile_picture;
            user.displayName = user.displayName || body.user.username;
            user.save(function() {
              var token = createJWT(user);
              res.send({ token: token });
            });
          });
        });
      } else {
        // Step 2b. Create a new user account or return an existing one.
        console.log(body);
        User.findOne({ instagram: body.user.id }, function(err, existingUser) {
          if (existingUser) {
            return res.send({ token: createJWT(existingUser) });
          }

          var user = new User({
            instagram: body.user.id,
            picture: body.user.profile_picture,
            displayName: body.user.username,
            instagramToken: body.access_token
          });
          user.save(function() {
            var token = createJWT(user);
            res.send({ token: token, user: user });
          });
        });
      }
    });
  }
