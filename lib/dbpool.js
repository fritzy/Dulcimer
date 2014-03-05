var levelup = require('levelup');

var pool = {
};

var last_used = {
};

function getByPath(path) {
    var now = Date.now();
    var db, pidx, paths;

    if (pool.hasOwnProperty(path)) {
        last_used[path] = Date.now();
        db = pool[path];
    } else {
        db = pool[path] = levelup(path, {valueEncoding: 'json'});
        last_used[path] = Date.now();
    }

    paths = Object.keys(pool);
    
    if (paths.length > 30) {
        paths.sort(function (a, b) {
            if (last_used[a] > last_used[b]) {
                return -1;
            } else if (last_used[a] < last_used[b]) {
                return 1;
            } else {
                return 0;
            }
        });

        paths = paths.slice(0, paths.length - 30);

        for (pidx in paths) {
            if (now - last_used > 1800000) {
                pool[paths[pidx]].close();
                delete pool[paths[pidx]];
                delete last_used[paths[pidx]];
            }
        }
    }

    return db;
}

module.exports = getByPath;
