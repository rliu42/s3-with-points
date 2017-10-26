var Firebase = require("firebase"),
    config = require('./config');

var app_root = new Firebase(config.db.url).child("s3_points");
var tallyRef = app_root.child("tally");
var mailRef = app_root.child("mail");
var nameLookup = {};

app_root.once("value", function(ss) {
    if (!ss.val()) app_root.set({});
});

app_root.child("nameLookup").on("value", function(ss) {
    nameLookup = ss.val() || {};
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
                var sender = processAddressObject(mail.from[0]);
                if (sender.address) {
                    _tally[sender.address] = _tally[sender.address] || { points: 0 };
                    _tally[sender.address].points += SEND_MAIL_POINTS;
                }
                if (sender.name && sender.name !== sender.address) {
                    _tally[sender.name] = _tally[sender.name] || { points: 0, name: true};
                    _tally[sender.name].points += SEND_MAIL_POINTS;
                }
                var recipients = (mail.to || []).concat(mail.cc || []);
                recipients.filter(function(rcp) {
                    return is_kerberos(rcp.address) || is_personal_account(rcp.address);
                }).map(processAddressObject).forEach(function(user) {
                    if (user.address) {
                        _tally[user.address] = _tally[user.address] || { points: 0 };
                        _tally[user.address].points += REPLY_BONUS_POINTS;
                    }
                    if (user.name && user.name !== user.address) {
                        _tally[user.name] = _tally[user.name] || { points: 0, name: true};
                        _tally[user.name].points += REPLY_BONUS_POINTS;
                    }
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
    var sender = processAddressObject(mail.from[0]);
    if (sender.address) {
        tallyRef.child(sender.address).once("value", function(ss) {
            var _record = ss.val() || { points: 0 };
            _record.points += SEND_MAIL_POINTS;
            tallyRef.child(sender.address).update(_record);
        });
    }
    if (sender.name && sender.name !== sender.address) {
        tallyRef.child(sender.name).once("value", function(ss) {
            var _record = ss.val() || { points: 0 };
            _record.points += SEND_MAIL_POINTS;
            tallyRef.child(sender.name).update(_record);
        });
    }
    var recipients = (mail.to || []).concat(mail.cc || []);
    recipients.filter(function(rcp) {
        return is_kerberos(rcp.address) || is_personal_account(rcp.address);
    }).map(processAddressObject).forEach(function(user) {
        if (user.address) {
            tallyRef.child(user.address).once("value", function(ss) {
                var _record = ss.val() || { points: 0 };
                _record.points += REPLY_BONUS_POINTS;
                tallyRef.child(user.address).update(_record);
            });
        }
        if (user.name && user.name !== user.address) {
            tallyRef.child(user.name).once("value", function(ss) {
                var _record = ss.val() || { points: 0 };
                _record.points += SEND_MAIL_POINTS;
                tallyRef.child(user.name).update(_record);
            });
        }
    });
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

var processAddressObject = function(rcp) {
    rcp.address = rcp.address || "";
    rcp.address = rcp.address.toLowerCase();
    rcp.address = rcp.address.replace(/\.(com|net|edu)$/gi, "");
    rcp.address = rcp.address.replace(/[\"\'\.\<\>]/gi, "");
    rcp.name = nameLookup[rcp.address] || rcp.name || "";
    rcp.name = rcp.name.replace(/\.(com|net|edu)$/gi, "");
    rcp.name = rcp.name.replace(/[\"\'\.\<\>]/gi, "");
    var split = rcp.name.split(/\s+/);
    var firstName = split[0] || "";
    var lastName = split.length > 1 ? split[split.length-1] : "";
    rcp.name = (firstName + " " + lastName).trim();
    if (!nameLookup[rcp.address] && rcp.name) {
        app_root.child("nameLookup/" + rcp.address).set(rcp.name);
    }
    return rcp;
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