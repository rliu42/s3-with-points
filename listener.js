var MailListener = require('mail-listener2'),
    config = require('./config'),
    constants = require('./constants'),
    logger = require('./logger')


var options = {
    username: config.log_account.user,
    password: config.log_account.pass,
    host: "imap.gmail.com",
    port: 993, // imap port
    tls: true,
    connTimeout: 10000, // Default by node-imap
    authTimeout: 5000, // Default by node-imap,
    debug: null, // Or your custom function with only one incoming argument. Default: null
    tlsOptions: { rejectUnauthorized: false },
    mailbox: "INBOX", // mailbox to monitor
    searchFilter: ["UNSEEN"], // the search filter being used after an IDLE notification has been retrieved
    markSeen: true, // all fetched email will be marked as seen and not fetched next time
    fetchUnreadOnStart: true, // use it only if you want to get all unread email on lib start. Default is `false`,
    mailParserOptions: { streamAttachments: false }, // options to be passed to mailParser lib.
    attachments: false, // download attachments as they are encountered to the project directory
}

var mailListener = new MailListener(options);

/*var options_sent = JSON.parse(JSON.stringify(options));
options_sent.mailbox = "SENT";
var mailListener_sent = new MailListener(options);*/

var is_safetythird = function(mail) {
    var contains_safetythird = function(rcp) {
        var matched = constants.MAILING_LISTS.find(function(list) {
            return list.toLowerCase() == (rcp.address || "").toLowerCase();
        })
        return !!matched;
    }
    var to_safetythird = (mail.to || []).find(contains_safetythird);
    var cc_safetythird = (mail.cc || []).find(contains_safetythird);
    return to_safetythird || cc_safetythird;
}

var handle_mail = function(mail, seqno, attributes) {
    if (is_safetythird(mail)) {
        logger.log_mail(mail);
    } else {
        console.log("Mail event not logged: ", {
            subject: mail.subject,
            from: mail.from,
            to: mail.to,
            cc: mail.cc,
            text: mail.text
        });
    }
}

mailListener.start();

mailListener.on("server:connected", function() {
    console.log("imap connected");
    console.log("listening for mail to following lists: " + constants.MAILING_LISTS);
});

mailListener.on("server:disconnected", function() {
    console.log("imap disconnected");
});

mailListener.on("error", function(err) {
    console.log(err);
});

mailListener.on("mail", handle_mail);

/*mailListener_sent.start();
mailListener_sent.on("error", function(err) {
    console.log(err);
});
mailListener_sent.on("server:connected", function() {
    console.log("imap_sent connected");
});
mailListener_sent.on("mail", handle_mail);*/