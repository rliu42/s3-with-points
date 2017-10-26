var express = require('express'),
    router = express.Router(),
    Firebase = require('firebase'),
    config = require('../config');

var app_root = new Firebase(config.db.url).child("s3_points");
var tallyRef = app_root.child("tally");
var mailRef = app_root.child("mail");
var nameLookupRef = app_root.child("nameLookup");
var yearLookupRef = app_root.child("yearLookup");

// GET /api/leaderboard
router.get('/leaderboard', function(req, res) {
    tallyRef.once("value", function(ss) {
        var leaderboard = { by_name: [], by_email: [] };
        Object.keys(ss.val() || {}).forEach(function(k) {
            var record = ss.val()[k];
            record.user = k;
            if (record.name) {
                delete record.name;
                leaderboard.by_name.push(record);
            } else {
                leaderboard.by_email.push(record);
            }
        });
        Object.keys(leaderboard).forEach(function(k) {
            leaderboard[k] = leaderboard[k].filter(function(record) {
                return record.points >= 5;
            });
            leaderboard[k].sort(function(a, b) {
                return b.points - a.points;
            });
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

// GET /api/lookup_tables
router.get('/lookup_tables', function(req, res) {
    var ret = {};
    nameLookupRef.once("value", function(ss) {
        ret.names = ss.val() || {};
        yearLookupRef.once("value", function(ss) {
            ret.years = ss.val() || {};
            res.json(ret);
        });
    });
});

// POST /api/class_year
router.post('/class_year', function(req, res) {
    var year = parseInt(req.body.year) || 0;
    var validate = (year >= 2012 && year <= new Date().getFullYear() + 4);
    if (validate) {
        yearLookupRef.child(req.body.user).set(year);
    } else {
        yearLookupRef.child(req.body.user).set("");
    }
    res.json(req.body);
});

module.exports = router;