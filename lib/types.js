var moment = require('moment');

module.exports = {
    moment: {
        onSet: function (v) {
            if (!moment.isMoment(v)) {
                return moment(v);
            }
            return v;
        },
        processIn: function (v) {
            if (!moment.isMoment(v)) {
                return moment(v);
            }
            return v;
        },
        processOut: function (v) {
            if (moment.isMoment(v)) {
                return v.valueOf();
            }
            return v;
        },
        required: true,
        default: function () {
            return moment();
        }
    },
};
