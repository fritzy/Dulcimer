var dulcimer = require('./index');
var levelup = require('levelup');
var db = levelup('./test.db', {valueEncoding: 'json'});

var PersonFactory = new dulcimer.Model({
    firstName: {},
    lastName: {},
    fullName: {derive: function () {
        return this.firstName + ' ' + this.lastName;
    }},
}, {db: db, name: 'person'});

var nathan = PersonFactory.create({
    firstName: 'Nathan',
    lastName: 'Fritz',
});
nathan.save(function (err) {
    PersonFactory.all(function (err, persons) {
        persons.forEach(function (person) {
            console.dir(person.toJSON());
        });
    });
});
