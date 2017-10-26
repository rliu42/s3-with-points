var express = require('express'),
    router = express.Router(),
    Firebase = require('firebase'),
    config = require('../config');

var app_root = new Firebase(config.db.url).child("s3_points");
var tallyRef = app_root.child("tally");
var mailRef = app_root.child("mail");

// GET /api/leaderboard
router.get('/leaderboard', function(req, res) {
    tallyRef.once("value", function(ss) {
        var leaderboard = [];
        Object.keys(ss.val() || {}).forEach(function(k) {
            var record = ss.val()[k];
            record.user = k;
            leaderboard.push(record);
        });
        leaderboard = leaderboard.filter(function(record) {
            return record.points >= 5;
        })
        leaderboard.sort(function(a, b) {
            return b.points - a.points;
        });
        res.json(leaderboard);
    });
});

// GET /api/mail?user=
router.get('/mail', function(req, res) {
    var user = req.query.user || "";
    mailRef.once("value", function(ss) {
        var ret = (ss.val() || []).filter(function(mail) {
            return user ? mail.from[0].address.indexOf(user) > -1 : true;
        }).sort(function(a, b) {
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
        res.json(ret);
    });
});

module.exports = router;