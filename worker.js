var logger = require('./logger');
var tallier = require('./tallier');
var lister = require('./listener');

var reset = false;
if (reset) {
    console.log("Resetting tally..");
    tallier.resetTally(function() {
        tallier.bulkTally();
    });
} else {
    console.log("Starting worker..");
    logger.mailRef.on("child_added", function(ss, prevKey) {
        var mail = ss.val();
        mail.key = !!parseInt(prevKey) ? parseInt(prevKey) + 1 : 0;
        if (!mail.tallied) {
            console.log("child_added - Tallying record " + mail.key);
            tallier.tally(mail);
        }
    });
    logger.mailRef.once("value", function(ss) {
        var mail_data = ss.val();
        var found = false;
        mail_data.forEach(function(mail, index) {
            if (!mail.tallied && !!!parseInt(index)) {
                found = true;
                mail.key = parseInt(index);
                console.log("Tallying record " + mail.key);
                tallier.tally(mail);
            }
        });
        console.log(found ? "" : "No un-tallied mail");
    });
}