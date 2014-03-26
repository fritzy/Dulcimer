module.exports = {
    incrementKey: function incrementKey(db, key, change, callback) {
        var count;
        db.get(key, {valueEncoding: 'utf8'}, function (err, val) {
            if (err || !val) {
                count = 0;
            } else {
                count = parseInt(val, 10);
            }
            count += change;
            db.put(key, count, {valueEncoding: 'utf8'}, function (err, val) {
                callback(err, count);
            });
        });
    }
};
