var dulcimer = require('../index.js');
var LevelDulcimer = require('level-dulcimer');
var db = dulcimer.connect(__dirname + '/testdb.db');
var async = require('async');
var verymodel = require('verymodel');
var dbstreams = require('../lib/streams');
var uuid = require('uuid-v4');
var stream = require('stream');

process.on('uncaughtException', function (err) {
    console.trace();
    console.error(err.stack);
    process.exit();
});

module.exports = {
    'Create multiple children': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {name: 'TM'});
        var TMC = new dulcimer.Model({cidx: {}}, {name: 'RC'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            var cidx = 0;
            async.whilst(function () {
                cidx++;
                return cidx <= 10;
            },
            function (acb) {
                var tmc = tm.createChild(TMC, {cidx: cidx});
                tmc.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                tm.getChildren(TMC, function (err, children, info) {
                    test.equal(children.length, 10, "Not all children found (" + children.length + ")");
                    children.forEach(function(child) {
                        test.equals(child.key.indexOf('!'), -1);
                        test.equals(child.key.indexOf('_'), -1);
                    });
                    children[0].delete(function (err) {
                        tm.getChildren(TMC, function (err, children, info) {
                            test.equal(info.total, 9);
                            test.done();
                        });
                    });
                });
            });
        });
    },
    'Get Children By Index': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {name: 'TMI'});
        var TMC = new dulcimer.Model({cidx: {type: 'integer', index: true}}, {name: 'RCI'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            var cidx = 0;
            async.whilst(function () {
                cidx++;
                return cidx <= 10;
            },
            function (acb) {
                var tmc = tm.createChild(TMC, {cidx: cidx % 2});
                tmc.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                tm.getChildrenByIndex(TMC, 'cidx', 1, function (err, children, info) {
                    test.equal(children.length, 5, "Not all children found (" + children.length + ")");
                    test.done();
                });
            });
        });
    },
    'Custom keyname': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {name: 'TM'});
        var tm = TM.create({idx: 'crap', key: 'custom'});
        test.equal(tm.key, 'custom');
        test.done();

    },
    'Keyname is not undefined': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'TM'});
        var tm = TM.create({idx: 'crap'});
        test.notEqual(tm.key, 'TM!undefined');
        test.done();
    },
    'Delete old index': function (test) {
        var TM = new dulcimer.Model({idx: {index: true}, name: {}}, {db: db, name: 'DOI'});
        var tm = TM.create({'idx':  'ham', 'name': 'swiss'});
        tm.save(function (err) {
            test.ifError(err);
            TM.getByIndex('idx', 'ham', function (err, tms) {
                test.ifError(err);
                test.equals(tms.length, 1, 'Should have had one');
                tm.idx = 'salami';
                tm.save(function (err) {
                    test.ifError(err);
                    TM.getByIndex('idx', 'ham', function (err, tms) {
                        test.ok(Array.isArray(tms) && tms.length === 0);
                        TM.getByIndex('idx', 'salami', function (err, tms, total) {
                            test.equals(tms.length, 1);
                            test.done();
                        });
                    });
                });
            });
        });
    },
    'Delete key': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'TM'});
        var tm = TM.create({idx: 'crap', key: 'custom', index: true});
        test.equal(tm.key, 'custom');
        tm.save(function (err) {
            test.ifError(err, "error");
            TM.delete('custom', function (err) {
                test.ifError(err);
                test.done();
            });
        });
    },
    "Don't default with value": function (test) {
        var TM = new dulcimer.Model({idx: {default: 'crap'}, required: true}, {db: db, name: 'DDF'});
        var tm = TM.create({idx: 'news'});
        test.equals(tm.idx, 'news');
        test.done();
    },
    "Don't default function with value": function (test) {
        var TM = new dulcimer.Model({idx: {default: function () { return 'crap'; }, required: true}}, {db: db, name: 'DDF'});
        var tm = TM.create({idx: 'news'});
        test.equals(tm.idx, 'news');
        var tmo = tm.toJSON();
        test.equals(tmo.idx, 'news');
        tm.save(function (err) {
            TM.load(tm.key, function (err, ntm) {
                test.equals(ntm.idx, 'news');
                test.done();
            });
        });

    },
    "Update shouldn't create a duplicate": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'ND'});
        var tm = TM.create({idx: 'hi'});
        tm.save(function (err) {
            TM.update(tm.key, {idx: 'nope'}, function (err, ntm) {
                test.equals(tm.key, ntm.key);
                TM.all(function (err, tms, info) {
                    test.equals(tms.length, 1);
                    test.equals(info.total, 1);
                    test.done();
                });
            });
        });
    },
    "Update shouldn't create a new if previous isn't found": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'ND'});
        TM.update('xxx', {idx: 'hi'}, function (err, tm) {
            test.ok((err !== undefined));
            test.equals(typeof tm, 'undefined');
            test.done();
        });
    },
    "Indexes shouldn't get duplicated": function (test) {
        var TM = new dulcimer.Model({idx: {index: true}, name: {}}, {db: db, name: 'HAM'});
        var tm = TM.create({idx: 'nope', name: 'ham'});
        tm.save(function (err) {
            TM.update(tm.key, {name: 'cheese'}, function (err, ntm) {
                TM.update(ntm.key, {name: 'chowder'}, function (err, ntm2) {
                    TM.getByIndex('idx', 'nope', function (err, tms) {
                        test.equals(tms.length, 1);
                        test.done();
                    });
                });
            });
        });
    },
    "Deleting one index shouldn't delete all": function (test) {
        var TM = new dulcimer.Model({idx: {}, name: {index: true}}, {db: db, name: 'ATM'});
        var idx = 0;
        async.whilst(
            function () {
                idx++;
                return idx <= 10;
            },
            function (acb) {
                var tm = TM.create({idx: idx, name: true});
                tm.save(acb);
            },
            function (err) {
                TM.getByIndex('name', true, function (err, tms) {
                    test.equals(tms.length, 10);
                    TM.update(tms[0].key, {name: false}, function (err, ntm) {
                        TM.getByIndex('name', true, function (err, tms) {
                            test.equals(tms[0].name, true);
                            test.equals(tms.length, 9);
                            test.done();
                        });
                    });
                });
            }
        );
    },
    "Test offset and limit": function (test) {
        var TM = new dulcimer.Model({idx: {}, name: {}}, {db: db, name: 'ARP'});
        var idx = 0;
        async.whilst(
            function () {
                idx++;
                return idx <= 100;
            },
            function (acb) {
                var tm = TM.create({idx: idx, name: 'billy' + idx});
                tm.save(acb);
            },
            function (err) {
                TM.all({limit: 10, offset: 10}, function (err, tms, info) {
                    test.equals(info.total, 100);
                    test.equals(tms.length, 10);
                    test.done();
                });
            }
        );
    },
    "onSave": function (test) {
        var XR = new dulcimer.Model({
            idx: {},
            name: {}
        }, {
            db: db,
            name: 'onsave',
            onSave: function (err, opts, cb) {
                test.ok(opts.changes.name.changed);
                test.ok(!opts.changes.idx.changed);
                test.ok(opts.ctx === 'hullo');
                cb(err);
            }
        });
        var tm = XR.create({idx: 1, name: 'Billy'});
        tm.name = 'Unbilly';
        tm.save({ctx: 'hullo'}, function (err) {
            test.done();
        });
    },
    "onDelete": function (test) {
        var XR = new dulcimer.Model({
            idx: {},
            name: {}
        }, {
            db: db,
            name: 'ondel',
            onDelete: function (err, opts, cb) {
                cb(err);
            }
        });
        var tm = XR.create({idx: 1, name: 'Billy'});
        tm.save(function (err) {
            tm.delete(function (err) {
                test.done();
            });
        });
    },
    "get by child key": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'gbckp'});
        var TMC = new dulcimer.Model({cidx: {}}, {db: db, name: 'childgbcp'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            var tmc = tm.createChild(TMC, {cidx: 2});
            tmc.save(function (err) {
                tm.getChild(TMC, tmc.key, function (err, result) {
                    test.equals(result.cidx, 2);
                    test.done();
                });
            });
        });
    },
    "boolean indexes": function (test) {
        var TM = new dulcimer.Model({idx: {}, thingy: {index: true}}, {db: db, name: 'boolidx'});
        var tm1 = TM.create({idx: 1, thingy: false});
        tm1.save(function (err) {
            var tm2 = TM.create({idx: 2, thingy: true});
            tm2.save(function (err) {
                TM.getByIndex('thingy', true, function (err, tms) {
                    test.equals(tms.length, 1);
                    test.equals(tms[0].idx, 2);
                    TM.getByIndex('thingy', false, function (err, tms) {
                        test.equals(tms.length, 1);
                        test.equals(tms[0].idx, 1);
                        test.done();
                    });
                });
            });
        });
    },
    "moment type": function (test) {
        var TM = new dulcimer.Model({field: {type: 'moment'}}, {db: db, name: 'moment_type'});
        var tm = TM.create({field: new Date(1981, 02, 10)});
        test.equals(tm.field.format('E'), '2');
        test.done();
    },
    "moment index": function(test) {
        var TM = new dulcimer.Model({field: {type: 'moment', index: true}}, {db: db, name: 'moment_index'});
        var tms = [];
        tms.push(TM.create({field: new Date(1981, 02, 10)}));
        tms.push(TM.create({field: new Date(1981, 02, 11)}));
        tms.push(TM.create({field: new Date(1981, 02, 12)}));
        tms.push(TM.create({field: new Date(1981, 02, 13)}));
        tms.push(TM.create({field: new Date(1981, 02, 14)}));
        tms.push(TM.create({field: new Date(1981, 02, 15)}));
        tms.push(TM.create({field: new Date(1981, 02, 16)}));
        var count = 0;
        tms.forEach(function (tm) {
            tm.save(function (err) {
                count++;
                if (count === tms.length) {
                    TM.all({sortBy: 'field'}, function (err, otms) {
                        var prev = 0;
                        otms.forEach(function (tm) {
                            var value = tm.field.valueOf();
                            test.ok(value > prev);
                            prev = value;
                        });
                        test.done();
                    });
                }
            });
        });
    },
    "integer indexes": function (test) {
        var TM = new dulcimer.Model({idx: {index_int: true}, thingy: {}}, {db: db, name: 'intidx'});
        var tm = TM.create({idx: 3509835098567, thingy: 'Well hello there!'});
        tm.save(function (err) {
            TM.getByIndex('idx', 3509835098567, function (err, tms) {
                test.equals(tms.length, 1);
                test.equals(tms[0].idx, 3509835098567);
                test.done();
            });
        });
    },
    "index string ordering": function (test) {
        var TZ = new dulcimer.Model({idx: {}, name: {index: true}}, {db: db, name: 'idxorder'});
        var cidx = 0;
        async.eachSeries(['ham', 'cheese', 'zamboni', 'cow', 'nope', 'apple'],
            function (name, acb) {
                var tm = TZ.create({idx: cidx, name: name});
                tm.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                TZ.all({sortBy: 'name'}, function (err, children) {
                    test.ifError(err);
                    test.equals(children.length, 6);
                    test.equals(children[0].name, 'apple');
                    test.equals(children[1].name, 'cheese');
                    test.equals(children[2].name, 'cow');
                    test.equals(children[3].name, 'ham');
                    test.equals(children[4].name, 'nope');
                    test.equals(children[5].name, 'zamboni');
                    test.done();
                });
            }
        );
    },
    "index integer ordering": function (test) {
        var TZ = new dulcimer.Model({idx: {index_int: true}}, {db: db, name: 'idxintorder'});
        var cidx = 0;
        async.eachSeries([24, 100, 1, 244, 24, 34563653, 50],
            function (name, acb) {
                var tm = TZ.create({idx: name});
                tm.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                TZ.allSortByIndex('idx', function (err, nums) {
                    nums.forEach(function(num) {
                        test.equals(num.key.indexOf('!'), -1);
                        test.equals(num.key.indexOf('_'), -1);
                    });
                    test.ifError(err);
                    test.equals(nums.length, 7);
                    test.equals(nums[0].idx, 1);
                    test.equals(nums[1].idx, 24);
                    test.equals(nums[2].idx, 24);
                    test.equals(nums[3].idx, 50);
                    test.equals(nums[4].idx, 100);
                    test.equals(nums[5].idx, 244);
                    test.equals(nums[6].idx, 34563653);
                    TZ.allSortByIndex('idx', {offset: 2, limit: 3, reverse: true}, function (err, nums) {
                        test.ifError(err);
                        test.equals(nums.length, 3);
                        test.equals(nums[0].idx, 100);
                        test.equals(nums[1].idx, 50);
                        test.equals(nums[2].idx, 24);
                        test.done();
                    });
                });
            }
        );
    },
    "Saving Derived Fields": function (test) {
        var TZ = new dulcimer.Model(
        {
            idx: {index_int: true},
            thing1: {
                type: 'boolean',
            },
            thing2: {},
            thing3: {},
            complete: {
                derive: function () {
                    return !!(this.thing1 && this.thing2 && this.thing3);
                },
                index: true,
            },
        },
        {db: db, name: 'derivefield'});
        var tz = TZ.create({idx: 1, thing1: true, thing2: "hi there", thing3: "yo"});
        tz.save(function (err) {
            TZ.getByIndex('complete', true, function (err, tzs) {
                test.equals(tzs.length, 1);
                tzs[0].thing2 = "";
                tzs[0].save(function (err) {
                    TZ.getByIndex('complete', false, function (err, tzs) {
                        test.equals(tzs.length, 1);
                        TZ.getByIndex('complete', true, function (err, tzs) {
                            test.ok(!tzs || (Array.isArray(tzs) && tzs.length === 0));
                            test.done();
                        });
                    });
                });
            });
        });

    },
    "update doValidate": function (test) {
        var TZ = new dulcimer.Model({idx: {}, email: {type: new verymodel.VeryType().isEmail()}}, {db: db, name: 'updatevalidate'});
        var tz = TZ.create({idx: 1, email: 'userdoozer.com'});
        tz.save(function (err) {
            TZ.update(tz.key, {email: 'asdfsadham.org'}, {validate: true}, function (err, ntz) {
                test.ok(Array.isArray(err) && err.length === 1);
                test.ok(!ntz);
                test.done();
            });
        });
    },
    "Submodel test": function (test) {
        var SM = new dulcimer.Model({name: {}}, {db: db, name: 'submodel'});
        var PM = new dulcimer.Model({name: {}, thing: {foreignKey: SM}}, {db: db, name: 'parentmodel'});
        var sm = SM.create({name: 'derp'});
        sm.save(function (err) {
            var pm = PM.create({name: 'herp', thing: sm});
            pm.save(function (err) {
                test.ok(pm.toJSON().thing !== 'object');
                PM.load(pm.key, function (err, pm2) {
                    test.ok(pm2.thing.name === 'derp');
                    test.done();
                });
            });
        });
    },
    "Collection Test": function (test) {
        var SM = new dulcimer.Model({name: {}}, {db: db, name: 'submodelcol'});
        var PM = new dulcimer.Model({name: {}, stuff: {foreignCollection: SM}}, {db: db, name: 'parentmodelcol'});
        var sm = SM.create({bucket: 'hi', name: 'derp'});
        sm.save({bucket: 'hi'}, function (err) {
            var  sm2 = SM.create({name: 'lerp'});
            sm2.save({bucket: 'hi'}, function (err) {
                var pm = PM.create({bucket: 'hi', name: 'no more', stuff: [sm.key, sm2.key]});
                pm.save({bucket: 'hi'}, function (err) {
                    PM.load(pm.key, {bucket: 'hi'}, function (err, pm2) {
                        test.ok(pm2.stuff[0].name === 'derp');
                        test.ok(pm2.stuff[1].name === 'lerp');
                        PM.all({depth: 2, bucket: 'hi'}, function (err, pms) {
                            test.done();
                        });
                    });
                });
            });
        });
    },
    "Bad Foreign Key": function (test) {
        var TMa = new dulcimer.Model({idx: {}}, {db: db, name: 'bfka'});
        var TM = new dulcimer.Model({idx: {}, other_id: {foreignKey: TMa, default: {}}, other_col: {foreignCollection: TMa, default: 'lkjsdf'}}, {db: db, name: 'bfkb'});
        var tm = TM.create({idx: 'ham'});
        tm.save(function (err) {
            TM.load(tm.key, function (err, tm2) {
                test.done();
            });
        });
    },
    "Bad Load": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'BL'});
        TM.load({}, function (err, tm) {
            test.done();
        });
    },
    "onSet": function (test) {
        var TM = new dulcimer.Model({idx: {}, name: {onSet: function (value) {
            return "cheese";
        }}}, {db: db, name: 'onset'});
        var tm = TM.create({idx: 1, name: 'ham'});
        test.equals(tm.name, 'ham');
        tm.name = 'whatever';
        test.equals(tm.name, 'cheese');
        test.done();
    },
    "key generator": function (test) {
        var out;
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'keygenerator', keyGenerator: function (cb) {
            var key = uuid();
            out = key;
            cb(false, key);
        }});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            test.equals(tm.key.substr(tm.key.length - out.length), out);
            test.done();
        });
    },
    "keyType": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'keytype', keyType: 'uuid'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            test.ok(uuid.isUUID(tm.key));
            test.done();
        });
    },
    "Index Range And Filter": function (test) {
        var TM = new dulcimer.Model({idx: {}, date: {index: true}}, {db: db, name: 'index-range'});
        var cidx = 0;
        async.whilst(function () {
            cidx++;
            return cidx <= 15;
        },
        function (acb) {
            var tm = TM.create({idx: cidx, date: '2014-02-' + (10 + cidx)});
            tm.save(function (err) {
                acb(err);
            });
        },
        function (err) {
            async.series([
                function (scb) {
                    TM.all({index: 'date', indexRange: {start: '2014-02-13', end: '2014-02-17'}}, function (err, tms) {
                        test.equals(tms[0].date, '2014-02-13');
                        test.equals(tms[1].date, '2014-02-14');
                        test.equals(tms[2].date, '2014-02-15');
                        test.equals(tms[3].date, '2014-02-16');
                        test.equals(tms[4].date, '2014-02-17');
                        test.equals(tms.length, 5);
                        scb();
                    });
                },
                function (scb) {
                    TM.all({filter: function (tm) {
                        var day = tm.date.split('-');
                        day = day[day.length - 1];
                        if (parseInt(day, 10) % 2 === 0) {
                            return true;
                        } else {
                            return false;
                        }
                    }, sortBy: 'date'}, function (err, tms) {
                        test.equals(tms[0].date, '2014-02-12');
                        test.equals(tms[1].date, '2014-02-14');
                        test.equals(tms[2].date, '2014-02-16');
                        test.equals(tms[3].date, '2014-02-18');
                        test.equals(tms[4].date, '2014-02-20');
                        scb();
                    });
                }
            ],
            function (err) {
                test.done();
            });
        });
    },
    "Save should work with undefined index": function (test) {
        var TM = new dulcimer.Model({count: {}, something: {index: true}}, {name: 'savewithoutindex'});
        var tm = TM.create({count: 1});
        tm.key = 'derp';
        tm.save(function (err) {
            TM.get(tm.key, function (err, tm2) {
                test.equals(tm2.count, 1);
                test.done();
            });
        });
    },
    "User locking": function (test) {
        var TM = new dulcimer.Model({count: {}}, {db: db, name: 'userlock'});
        var increment = function (model, amount, cb) {
            TM.runWithLock(function (unlock) {
                TM.get(model.key, function (err, tm) {
                    tm.count += amount;
                    tm.save({withoutLock: true}, function (err) {
                        unlock(); //removing this causes tests undone
                        cb(err, tm.count);
                    });
                });
            });
        };

        var tm = TM.create({count: 0});
        tm.save(function (err) {
            //yes, each runs the next one before the first ecb
            async.each([10,10,10,10,5,3], function (amount, ecb) {
                increment(tm, amount, ecb);
            }, function (err) {
                TM.get(tm.key, function (err, tm) {
                    test.equals(48, tm.count);
                    test.done();
                });
            });
        });
    },
    "Normal paging": function (test) {
        var Main = new dulcimer.Model({idx: {type: 'integer', index: true}}, {name: 'normalpage'});
        var idx = 0;
        async.whilst(function () {
            idx += 1;
            return idx <= 100;
        },
        function (acb) {
            var m = Main.create({idx: idx});
            m.save(acb);
        },
        function (err) {
            var page = {count: -1};
            var loops = 0;
            async.whilst(function () {
                return page.count !== 0;
            },
            function (acb) {
                Main.all({limit: 10, continuation: page.continuation}, function (err, mains, pout) {
                    test.equals(pout.total, 100);
                    loops += 1;
                    page = pout;
                    if (pout.count === 0) {
                    }
                    acb();
                });
            },
            function (err) {
                test.equals(loops, 11);
                test.done();
            });
        });
    },
    "Sorted paging": function (test) {
        var Main = new dulcimer.Model({idx: {type: 'integer', index: true}}, {name: 'sortedpage'});
        var idx = 0;
        async.whilst(function () {
            idx += 1;
            return idx <= 100;
        },
        function (acb) {
            var m = Main.create({idx: idx});
            m.save(acb);
        },
        function (err) {
            var page = {count: -1};
            var loops = 0;
            async.whilst(function () {
                return page.count !== 0;
            },
            function (acb) {
                Main.all({limit: 10, continuation: page.continuation, sortBy: 'idx'}, function (err, mains, pout) {
                    test.equals(pout.total, 100);
                    loops += 1;
                    page = pout;
                    if (pout.count === 0) {
                        test.ok(Array.isArray(mains));
                        test.equals(mains.length, 0);
                    }
                    acb();
                });
            },
            function (err) {
                test.equals(loops, 11);
                test.done();
            });
        });
    },
    "Key from index and delete": function (test) {
        var MF = new dulcimer.Model({
            identifier: {index: true, type: 'string'},
        }, {name: 'keyfromindextodelete'});
        var mf = MF.create({identifier: "doowop"});
        mf.save(function (err) {
            MF.findByIndex('identifier', "doowop", function (err, mf2) {
                MF.delete(mf2.key, function (err) {
                    MF.findByIndex('identifier', 'doowop', function (err, mf3) {
                        test.equals(typeof mf3, 'undefined');
                        test.done();
                    });
                });
            });
        });
    },
    "Get empty index": function (test) {
        var TM = new dulcimer.Model({hi: {index: true}}, {name: 'getemptyindex'});
        TM.getByIndex('hi', 'hello', function (err, tms, page) {
            test.ifError(err);
            test.ok(Array.isArray(tms));
            test.equals(tms.length, 0);
            test.done();
        });
    },
    "Get foreign keys": function (test) {
        var FTM = new dulcimer.Model({
            'msg': {},
            'others': {foreignKeys: 'otherside'},
        }, {name: 'foreignkeys'});
        var TM = new dulcimer.Model({
            name: {},
            messages: {foreignKeys: FTM},
        }, {name: 'foreignmaster'});
        var OTM = new dulcimer.Model({
            name: {},
        }, {name: 'otherside'});
        var tm = TM.create({
            name: 'main',
        });
        var ftm1 = FTM.create({msg: 'hello there'});
        var ftm2 = FTM.create({msg: 'oh hi'});
        var otm1 = OTM.create({name: 'right'});

        function tmSave() {
            tm.save(ftm1Save);
        }
        function ftm1Save(err) {
            ftm1.save(ftm2Save);
        }
        function ftm2Save(err) {
            ftm2.save(otm1Save);
        }
        function otm1Save(err) {
            otm1.save(ftm1ToTM);
        }
        function ftm1ToTM(err) {
            tm.addForeign('messages', ftm1.key, ftm2ToTM);
        }
        function ftm2ToTM(err) {
            tm.addForeign('messages', ftm2.key, otm1ToFTM);
        }
        function otm1ToFTM(err) {
            ftm1.addForeign('others', otm1.key, getFK);
        }
        function getFK(err) {
            tm.getForeign('messages', function (err, ftms, page) {
                test.ifError(err);
                test.ok(Array.isArray(ftms));
                test.equals(ftms.length, 2);
                test.equals(page.total, 2);
                getReverse();
            });
        }
        function getReverse() {
            ftm2.getReverseForeign("foreignmaster", "messages", function (err, tms, page) {
                test.ifError(err);
                test.ok(Array.isArray(tms));
                test.equals(tms.length, 1);
                test.equals(tms[0].key, tm.key);
                test.equals(page.total, 1);
                getRight1();
            });
        }
        function getRight1(err) {
            test.ifError(err);
            otm1.getReverseForeign("foreignkeys", 'others', function (err, ftms, page) {
                test.ifError(err);
                test.ok(Array.isArray(ftms));
                test.equals(ftms.length, 1);
                test.equals(page.total, 1);
                deleteMiddle();
            });
        }
        function deleteMiddle() {
            ftm1.delete(getLeft);
        }
        function getLeft(err) {
            test.ifError(err);
            tm.getForeign('messages', function (err, ftms, page) {
                test.ifError(err);
                test.ok(Array.isArray(ftms));
                test.equals(ftms.length, 1);
                test.equals(page.total, 1);
                getRight2();
            });
        }
        function getRight2(err) {
            test.ifError(err);
            otm1.getReverseForeign(FTM, 'others', function (err, ftms, page) {
                test.ifError(err);
                test.ok(Array.isArray(ftms));
                test.equals(ftms.length, 0);
                test.equals(page.total, 0);
                test.done();
            });
        }
        tmSave();
    },
    "Auto load foreign keys": function (test) {
        var Autoer = new dulcimer.Model({name: {}, others: {foreignKeys: 'autoloaded'}},{name: 'autoloader'});
        var Autoed = new dulcimer.Model({why: {}}, {name: 'autoloaded'});
        var ar = Autoer.create({name: 'main'});
        var ad1 = Autoed.create({why: 'not'});
        var ad2 = Autoed.create({why: 'for'});
        var ad3 = Autoed.create({why: 'now'});
        var ad4 = Autoed.create({why: 'did'});
        var ad5 = Autoed.create({why: 'has'});
        function saveAr() {
            ar.save(saveAd1);
        }
        function saveAd1(err) {
            test.ifError(err);
            ad1.save(saveAd2);
        }
        function saveAd2(err) {
            test.ifError(err);
            ad2.save(saveAd3);
        }
        function saveAd3(err) {
            test.ifError(err);
            ad3.save(saveAd4);
        }
        function saveAd4(err) {
            test.ifError(err);
            ad4.save(saveAd5);
        }
        function saveAd5(err) {
            test.ifError(err);
            ad5.save(bindAd1);
        }
        function bindAd1(err) {
            test.ifError(err);
            ar.addForeign('others', ad1, bindAd2);
        }
        function bindAd2(err) {
            test.ifError(err);
            ar.addForeign('others', ad2, bindAd3);
        }
        function bindAd3(err) {
            test.ifError(err);
            ar.addForeign('others', ad3, bindAd4);
        }
        function bindAd4(err) {
            test.ifError(err);
            ar.addForeign('others', ad4, bindAd5);
        }
        function bindAd5(err) {
            test.ifError(err);
            ar.addForeign('others', ad5, getAr);
        }
        function getAr(err) {
            test.ifError(err);
            Autoer.load(ar.key, function (err, ar2) {
                test.ok(Array.isArray(ar2.others));
                test.equals(ar2.others.length, 5);
                var whys = {'not': true, 'for': true, 'now': true, 'did': true, 'has': true};
                ar2.others.forEach(function (other) {
                    test.equals(whys[other.why], true);
                    delete whys[other.why];
                });
                test.done();
            });
        }
        saveAr();
    },
    "Export": function (test) {
        var TM = new dulcimer.Model({
            first: {},
            last: {},
            both: {derive: function () {
                return this.first + ' ' + this.last;
            }}
        }, {db: db, name: 'exportTest'});
        var receiver = new stream.Transform({objectMode: true});
        receiver._transform = function (list, x, next) {
            if (Array.isArray(list)) {
                var obj = list[0];
                test.ok('id' in obj);
                test.ok('first' in obj);
                test.ok('last' in obj);
                test.ok(!('both' in obj));
            }
            next();
        };
        receiver._flush = function (done) {
            done();
            test.done();
        };
        var tm = TM.create({first: 'John', last: 'Smith'});
        tm.save(function (err) {
            test.ifError(err);
            TM.exportJSON(receiver);
        });
    },
    "Import array": function (test) {
        var TM = new dulcimer.Model({
            first: {},
            last: {},
            both: {derive: function () {
                return this.first + ' ' + this.last;
            }}
        }, {db: db, name: 'importArrayTest'});
        var data = [
            {id: '00000001', first: 'John', last: 'Smith'},
            {id: '00000002', first: 'Bill', last: 'Jones'}
        ];

        TM.importData(data, function (err) {
            test.ok(!err, err);
            TM.all({}, function (err, list) {
                test.ok(!err, err);
                test.equal(list.length, 2);
                data.forEach(function (instance) {
                    test.ok(['John', 'Bill'].indexOf(instance.first) !== -1);
                    test.ok(['Smith', 'Jones'].indexOf(instance.last) !== -1);
                });
                test.done();
            });
        });
    },
    "Import stream": function (test) {
        var TM = new dulcimer.Model({
            first: {},
            last: {},
            both: {derive: function () {
                return this.first + ' ' + this.last;
            }}
        }, {db: db, name: 'importArrayTest'});
        var data =[
            {id: '00000001', first: 'John', last: 'Smith'},
            {id: '00000002', first: 'Bill', last: 'Jones'}
        ];
        var readable = new stream.Readable({objectMode: true});
        readable._read = function () {
            this.push(data.shift()||null);
        };
        TM.importData(readable, function (err) {
            test.ok(!err, err);
            TM.all({}, function (err, list) {
                test.ok(!err, err);
                test.equal(list.length, 2);
                data.forEach(function (instance) {
                    test.ok(['John', 'Bill'].indexOf(instance.first) !== -1);
                    test.ok(['Smith', 'Jones'].indexOf(instance.last) !== -1);
                });
                test.done();
            });
        });
    },
    /*
    "Wipe test": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'wipe'});
        var cidx = 0;
        async.whilst(function () {
            cidx++;
            return cidx <= 20;
        },
        function (acb) {
            var tm = TM.create({idx: {idx: cidx}});
            tm.save(function (err) {
                acb(err);
            });
        },
        function (err) {
            TM.wipe(function (err) {
                test.done();
            });
        });
    },
    "Export": function (test) {
        var TM = new dulcimer.Model({
            first: {},
            last: {},
            both: function () {
                return this.first + ' ' + this.last;
            }
        }, {db: db, name: 'exportTest'});
        var receiver = new stream.Transform({objectMode: true});
        receiver._transform = function (list, x, next) {
            if (Array.isArray(list)) {
                var obj = list[0];
                test.ok('id' in obj);
                test.ok('first' in obj);
                test.ok('last' in obj);
                test.ok(!('both' in obj));
            }
            next();
        };
        receiver._flush = function (done) {
            done();
            test.done();
        };
        var tm = TM.create({first: 'John', last: 'Smith'});
        tm.save(function (err) {
            test.ok(err == null);
            TM.exportJSON(receiver);
        });
    },
    "Delete All": function (test) {
        dbstreams.deleteKeysWithPrefix({db: db, prefix: "", bucket: ''}, function (err) {
            test.done();
        });
    },
    */
};
