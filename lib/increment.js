var inc = 0;

module.exports = {
    incrementKey: function incrementKey(db, key, change, callback) {
        if (db.isRiak) {
            db.riak.updateCounter({
                key: key,
                amount: change,
                bucket: 'default_levelup',
                returnvalue: true,
            }, function (err, reply) {
                callback(err, reply.value.low);
            });
        } else {
            var count;
            db.get(key, {valueEncoding: 'utf8'}, function (err, val) {
                if (err || !val) {
                    count = 0;
                } else {
                    count = parseInt(val, 10);
                }
                count += change;
                db.put(key, count, function (err, val) {
                    callback(err, count);
                });
            });
        }
    }
};
