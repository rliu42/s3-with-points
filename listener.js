var MailListener = require('mail-listener2'),
    config = require('./config'),
    constants = require('./constants'),
    logger = require('./logger')

var mailListener = new MailListener({
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
});

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