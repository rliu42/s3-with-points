var express = require('express'),
    router = express.Router(),
    Firebase = require('firebase'),
    tallier = require('../tallier'),
    constants = require('../constants'),
    _ = require('lodash')

const ext_server_ip = "72.29.29.198";
const port = "1011";

var tallyCache = {};
var mailCache = [];

try {
    var config = require('../config');
    var app_root = new Firebase(config.db.url).child("s3_points");
    var tallyRef = app_root.child("tally");
    var mailRef = app_root.child("mail");
    var nameLookupRef = app_root.child("nameLookup");
    var yearLookupRef = app_root.child("yearLookup");
    var penaltyWordsRef = app_root.child("penaltyWords");

    tallyRef.on("value", function(ss) {
        var data = ss.val();
        if (!_.isEmpty(data || {})) {
            tallyCache = data;
        }
    });

    mailRef.on("value", function(ss) {
        var data = ss.val();
        if (data && data.length) {
            mailCache = data;
        }
    });
} catch (e) {
    console.log("Config file not found. Requests will be redirected to external server");
    router.get("*", function(req, res) {
        var redirect = "http://" + ext_server_ip + ":" + port + req.originalUrl;
        console.log("Redirect to " + redirect);
        return res.redirect(redirect);
    });
}

// GET /api/leaderboard
router.get('/leaderboard', function(req, res) {
    var query = req.query;
    var leaderboard = { by_name: [], by_email: [] };

    function renderLeaderboard(tallies, callback) {
        Object.keys(tallies).forEach(function(k) {
            var record = JSON.parse(JSON.stringify(tallies[k]));
            record.user = k;
            if (!/\@/.test(record.user)) {
                leaderboard.by_name.push(record);
            } else {
                leaderboard.by_email.push(record);
            }
        });
        Object.keys(leaderboard).forEach(function(k) {
            leaderboard[k] = leaderboard[k].filter(function(record) {
                return record.points >= constants.SEND_MAIL_POINTS;
            });
            leaderboard[k].sort(function(a, b) {
                return b.points - a.points;
            });
        });
        res.json(leaderboard);
    }
    if (_.isEmpty(query || {})) {
        return renderLeaderboard(tallyCache);
    } else {
        getTallies(req.query, function(tallies) {
            renderLeaderboard(tallies);
        });
    }
});

var getTallies = function(query, callback) {
    var candidate_lists = Object.keys(query).filter(function(k) {
        return query[k] == "true";
    }).map(function(list) {
        return list.toLowerCase() + "@mit.edu";
    });
    console.log("search lists: " + candidate_lists);
    var filteredMail = mailCache.filter(function(mail) {
        var rcps = (mail.cc || []).concat(mail.to || []);
        var matched_rcp = rcps.find(function(rcp) {
            return candidate_lists.indexOf((rcp.address || "").toLowerCase()) > -1;
        });
        return !!matched_rcp;
    });
    console.log("Searched " + filteredMail.length)
    filteredMail.forEach(function(mail) {
        mail.tallied = false;
    });
    var tally = tallier.computeTally(filteredMail, {});
    callback(tally);
}


// GET /api/mail?user=
router.get('/mail', function(req, res) {
    var LIMIT = 1000;
    var user = req.query.user || "";
    var ret = mailCache.filter(function(mail) {
        if (!mail.timestamp) return false;
        return user ? mail.from[0].address.indexOf(user) > -1 : true;
    }).sort(function(a, b) {
        return (b.timestamp || 0) - (a.timestamp || 0);
    });
    res.json(ret);
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

// GET /api/lists
router.get('/constants', function(req, res) {
   penaltyWordsRef.once("value", function(ss) {
        constants.penalty_words = ss.val() || [];
        res.json(constants);
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

penaltyWordsRef.set(require('../penalty_words'));

module.exports = router;