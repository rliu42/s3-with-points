var Firebase = require("firebase"),
    config = require('./config'),
    constants = require('./constants')

var app_root = new Firebase(config.db.url).child("s3_points");
var mailRef = app_root.child("mail");
var tallyRef = app_root.child("tally");
var nameLookupRef = app_root.child("nameLookup");
var penaltyWordsRef = app_root.child("penaltyWords");

var nameLookup = {};
nameLookupRef.on("value", function(ss) {
    nameLookup = ss.val() || {};
});
var penalty_words = [];
penaltyWordsRef.on("value", function(ss) {
    penalty_words = ss.val() || [];
});

var Tallier = function() {

    var that = Object.create(Tallier.prototype);

    that.computeTally = function(mail_data, current_tally) {
        current_tally = current_tally || {};
        mail_data.forEach(function(mail, index) {
            if (!mail.from || !mail.from[0]) {
                mail_data[index].tallied = true;
                console.log("No valid sender for record " + index);
                return;
            }
            if (mail.tallied) {
                console.log("Already tallied record " + index);
                return;
            }
            if (!mail.penalty) {
                mail.penalty_words = penalty_words.filter(function(word) {
                    return ((mail.text || "") + (mail.subject || "")).toLowerCase().indexOf(word) > -1;
                });
                mail.penalty = mail.penalty_words.length;
            }
            var sender = processAddressObject(mail.from[0]);
            if (sender.address) {
                current_tally[sender.address] = current_tally[sender.address] || { points: 0 };
                current_tally[sender.address].points += (mail.penalty ? -1 * mail.penalty : constants.SEND_MAIL_POINTS);
            }
            if (sender.name && sender.name !== sender.address) {
                current_tally[sender.name] = current_tally[sender.name] || { points: 0, name: true };
                current_tally[sender.name].points += (mail.penalty ? -1 * mail.penalty : constants.SEND_MAIL_POINTS);
            }
            var recipients = (mail.to || []).concat(mail.cc || []);
            recipients.filter(function(rcp) {
                return is_kerberos(rcp.address) || is_personal_account(rcp.address);
            }).map(processAddressObject).forEach(function(user) {
                if (user.address) {
                    current_tally[user.address] = current_tally[user.address] || { points: 0 };
                    current_tally[user.address].points += constants.REPLY_BONUS_POINTS;
                }
                if (user.name && user.name !== user.address) {
                    current_tally[user.name] = current_tally[user.name] || { points: 0, name: true };
                    current_tally[user.name].points += constants.REPLY_BONUS_POINTS;
                }
            });
            //console.log("Tallied record " + index);
            mail.tallied = true;
        });
        return current_tally;
    }

    that.bulkTally = function() {
        tallyRef.once("value", function(ss) {
            var current_tally = ss.val() || {};
            mailRef.once("value", function(ss) {
                var mail_data = ss.val() || [];
                console.log("Tallying " + mail_data.length + " records");
                current_tally = that.computeTally(mail_data, current_tally);
                console.log("Bulk tally completed");
                mailRef.set(mail_data);
                tallyRef.set(current_tally);
            });
        });
    }

    that.tally = function(mail) {
        mailRef.child(mail.key).update({ tallied: true });
        if (mail.tallied || !mail.from || !mail.from[0]) return;
        console.log("Tally new record: ", mail);
        var sender = processAddressObject(mail.from[0]);
        if (sender.address) {
            tallyRef.child(sender.address).once("value", function(ss) {
                var _record = ss.val() || { points: 0 };
                _record.points += (mail.penalty ? -1 * mail.penalty : constants.SEND_MAIL_POINTS);
                tallyRef.child(sender.address).update(_record);
            });
        }
        if (sender.name && sender.name !== sender.address) {
            tallyRef.child(sender.name).once("value", function(ss) {
                var _record = ss.val() || { points: 0, name: true };
                _record.points += (mail.penalty ? -1 * mail.penalty : constants.SEND_MAIL_POINTS);
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
                    _record.points += constants.REPLY_BONUS_POINTS;
                    tallyRef.child(user.address).update(_record);
                });
            }
            if (user.name && user.name !== user.address) {
                tallyRef.child(user.name).once("value", function(ss) {
                    var _record = ss.val() || { points: 0, name: true };
                    _record.points += constants.REPLY_BONUS_POINTS;
                    tallyRef.child(user.name).update(_record);
                });
            }
        });
    }

    that.resetTally = function(callback) {
        tallyRef.set({});
        mailRef.once("value", function(ss) {
            var data = ss.val() || [];
            data.forEach(function(mail, index) {
                mail.tallied = false;
            });
            mailRef.set(data);
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
        var lastName = split.length > 1 ? split[split.length - 1] : "";
        rcp.name = (firstName + " " + lastName).trim();
        if (!nameLookup[rcp.address] && rcp.name) {
            nameLookupRef.child(rcp.address).set(rcp.name);
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

    Object.freeze(that);
    return that;
}

module.exports = Tallier();