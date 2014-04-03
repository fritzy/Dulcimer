var bignum = require('bignum');
var inc = 0;

module.exports = {
    incrementKey: function incrementKey(opts, callback) {
        if (opts.db.isRiak) {
            inc++;
            var count = bignum("" + String(Number(Date.now())) + inc + String(process.hrtime()[1]));
            return callback(false, count);
        } else {
            return this.incrementTotal(opts, callback);
        }
    },
    incrementTotal: function incrementTotal(opts, callback) {
        if (opts.db.isRiak) {
            opts.db.riak.updateCounter({
                key: opts.key,
                amount: opts.change,
                bucket: opts.bucket,
                returnvalue: true,
            }, function (err, reply) {
                callback(err, reply.value.low);
            });
        } else {
            var count;
            opts.db.get(opts.key, {valueEncoding: 'utf8'}, function (err, val) {
                if (err || !val) {
                    count = 0;
                } else {
                    count = parseInt(val, 10);
                }
                count += opts.change;
                opts.db.put(opts.key, count, function (err, val) {
                    callback(err, count);
                });
            });
        }
    }
};
