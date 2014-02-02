var VeryLevelModel = require('./index.js');
var level = require('level');
var db = level('./hi', {valueEncoding: 'json'});

var Person = new VeryLevelModel({
    first_name: {},
    last_name: {},
    full_name: {derive: function () {
        return this.first_name + ' ' + this.last_name;
    }, private: false},
    experience: {},
    title: {},
    twitter: {index: true}
}, {db: db, prefix: 'person!'});

var Thing = new VeryLevelModel({
    manufacturer: {},
    model: {}
}, {db: db, prefix: 'thing!'});


var gar = Person.create({
    first_name: 'Michael', 
    last_name: 'Garvin',
    twitter: '@gar',
});


gar.save(function (err) {
    console.log("save?");
    Person.load(gar.key, function (err, person) {
        console.log(person.toJSON());
        console.log(person.key);
    });
    var thing = gar.createChild(Thing, {manufacturer: 'Acme', model: 'AABBCC'});
    console.log(thing.key);
    console.log(thing.toJSON());
    thing.save(function (err) {
        console.log("saved the thing!");
        gar.getChildren(Thing, function (err, objs) {
            objs.forEach(function (thing) {
                console.log(thing.__verymeta.parent.full_name + "'s thing");
                console.log(thing.toJSON());
            });
        });
    });
    Person.getByIndex('twitter', '@gar', function (err, persons) {
        console.log("got twitter person");
        console.log(persons[0].toJSON());
    });
});

Person.all(function (err, objs) {
    objs.forEach(function (person) {
        console.log("=-=-=-=-=-=");
        console.log(person.toJSON({withPrivate: true}));
    });
});

