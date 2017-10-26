var Firebase = require("firebase"),
    config = require('./config');

var app_root = new Firebase(config.db.url).child("s3_points");
var tallyRef = app_root.child("tally");
var mailRef = app_root.child("mail");

app_root.once("value", function(ss) {
    if (!ss.val()) app_root.set({});
});

const SEND_MAIL_POINTS = 5;
const REPLY_BONUS_POINTS = 1;

var fields_to_log = ["from", "to", "cc", "subject", "messageId"];
exports.log_mail = function(mail) {
    mailRef.once("value", function(ss) {
        var data = ss.val() || [];
        var currentId = data.length;
        var record = {};
        fields_to_log.forEach(function(field) {
            if (mail[field])
                record[field] = mail[field];
        });
        record.timestamp = new Date(mail.date).getTime();
        var i = data.findIndex(function(mail) {
            return mail.messageId === record.messageId;
        });
        if (i == -1) {
          	mailRef.child(currentId).set(record);
        }
    });
}

var bulkTally = function() {
    tallyRef.once("value", function(ss) {
        var _tally = ss.val() || {};
        mailRef.once("value", function(ss) {
            (ss.val() || []).forEach(function(mail, index) {
                if (mail.tallied || !mail.from || !mail.from[0]) return;
                //console.log("Tally new record: ", mail);
                var sender = getUserFromAddress(mail.from[0]);
                _tally[sender] = _tally[sender] || { points: 0 };
                _tally[sender].points += SEND_MAIL_POINTS;
                var recipients = (mail.to || []).concat(mail.cc || []);
                recipients.filter(function(rcp) {
                    return is_kerberos(rcp.address) || is_personal_account(rcp.address);
                }).map(getUserFromAddress).forEach(function(user) {
                    _tally[user] = _tally[user] || { points: 0 };
                    _tally[user].points += REPLY_BONUS_POINTS;
                });
                mailRef.child(index).update({ tallied: true });
            });
            console.log("tally complete");
            tallyRef.set(_tally);
        });
    });
}

var tally = function(mail) {
    if (mail.tallied || !mail.from || !mail.from[0]) return;
    console.log("Tally new record: ", mail);
    var sender = getUserFromAddress(mail.from[0].address);
    tallyRef.child(sender).once("value", function(ss) {
        var _record = ss.val() || { points: 0 };
        _record.points += SEND_MAIL_POINTS;
        tallyRef.child(sender).update(_record);
    });
    var recipients = (mail.to || []).concat(mail.cc || []);
    recipients.filter(function(rcp) {
        return is_kerberos(rcp.address) || is_personal_account(rcp.address);
    }).map(getUserFromAddress).forEach(function(user) {
        tallyRef.child(user).once("value", function(ss) {
            var _record = ss.val() || { points: 0 };
            _record.points += REPLY_BONUS_POINTS;
            tallyRef.child(user).update(_record);
        });
    })
    mailRef.child(mail.key).update({ tallied: true });
}

mailRef.on("child_added", function(ss, prevKey) {
    var mail = ss.val();
    mail.key = parseInt(prevKey) + 1;
    tally(mail);
});

var resetTally = function(callback) {
    tallyRef.set({});
    mailRef.once("value", function(ss) {
        (ss.val() || []).forEach(function(mail, index) {
            mailRef.child(index).update({ tallied: false });
        });
        if (callback) callback();
    });
}

var getUserFromAddress = function(address) {
    if (typeof address === 'object') {
        address = address.address;
    }
    address = address || "";
    address = address.toLowerCase();
    if (is_kerberos(address)) {
        return address.split("@")[0];
    }
    address = address.replace(/\.(com|net|edu)$/gi, "");
    address = address.replace(/[\"\'\.]/gi, "");
    return address;
}

var is_mit = function(address) {
    return /\@mit\.edu/i.test(address);
}

var is_kerberos = function(address) {
    if (!is_mit(address)) return false;
    var user = address.toLowerCase().split("@")[0];
    return /^[a-z0-9\_]{3,8}$/.test(user);
}

var is_personal_account = function(address) {
	address = address || "";
    if (is_mit(address)) return false;
    return /\@/i.test(address);
}

/*resetTally(function() {
    bulkTally();
});*/