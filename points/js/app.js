var app = angular.module('pointsApp', ['ngMaterial', 'chart.js']);
var now = (new Date).getTime();
const timezone = "America/New_York";

var getResourcePath = function(resource) {
    var base_url = /file|localhost/.test(location.href) ? "http://localhost:1011/api" : "http://72.29.29.198:1011/api";
    return base_url + resource;
}

Chart.defaults.global.defaultFontFamily = 'Ubuntu, sans-serif';
Chart.defaults.global.animation.duration = 300;

app.controller('ChartController', function($scope, $http, $interval, $timeout, $window, $document) {
    $scope.datasetOverride = {
        borderWidth: 3,
        backgroundColor: ["rgba(255, 153, 0, 0.4)"],
        borderColor: ["rgba(255, 153, 0, 0.7)"],
        lineTension: 0.2,
        pointRadius: 1.5,
        pointHoverRadius: 2.5,
        fill: false
    }
    $scope.options = {
        responsive: true,
        scales: {
            xAxes: [{
                type: "time",
                scaleLabel: {
                    //display: true,
                    labelString: 'Time',
                    fontSize: 15,
                    fontStyle: "bold",
                    //fontColor: "#bbb"
                },
                ticks: {
                    //fontColor: "white",
                    fontSize: 14,
                    major: {
                        fontStyle: "bold",
                    }
                },
                time: {
                    displayFormats: {
                        second: "HH:mm:ss ",
                        minute: "HH:mm ",
                        day: "MMM D",
                        month: "MMM 'YY",
                        quarter: "MMM 'YY",
                        year: "YYYY"
                    },
                    minUnit: 'week'
                }
            }],
            yAxes: [{
                type: 'linear',
                position: 'left',
                scaleLabel: {
                    display: true,
                    labelString: 'Monthly Emails',
                    fontSize: 15,
                    fontStyle: "bold",
                    //fontColor: "#bbb"
                },
                ticks: {
                    suggestedMin: 0,
                    beginAtZero: true,
                    fontSize: 15,
                    //fontColor: "white",
                    major: {
                        fontStyle: "bold",
                    }
                }
            }]
        },
        tooltips: {
            fontFamily: "san-serif",
            titleFontSize: 14,
            bodyFontFamily: "san-serif",
            bodyFontSize: 15,
            //borderColor: "#fff",
            borderWidth: 0.5,
            callbacks: {
                label: function(ti) {
                    return " " + ti.yLabel + " Emails"
                }
            }
        }
    };
});

app.controller('MainController', function($scope, $http, $interval, $timeout, $window, $document) {

    $scope.now = new Date().getTime();
    $scope.class_years = [];
    for (var y = 2012; y <= new Date().getFullYear() + 4; y++) {
        $scope.class_years.push(y);
    }
    $scope.selected_view = "by_name";

    var name_lookup = {};
    var year_lookup = {};
    var name_lookup_inv = {};

    var loadMetadata = function(callback) {
        $http.get(getResourcePath('/lookup_tables')).success(function(data) {
            name_lookup = data.names;
            year_lookup = data.years;
            Object.keys(name_lookup).forEach(function(k) {
                name_lookup_inv[name_lookup[k]] = name_lookup_inv[name_lookup[k]] || [];
                name_lookup_inv[name_lookup[k]].push(k);
            });
            if (callback) callback();
        });
    }

    var from_emails = function(emails) {
        // filtering function
        var emails = emails || [];
        return function(item) {
            if (!(item.from && item.from[0] && item.from[0].address)) return false;
            var matched = emails.find(function(email) {
                return item.from[0].address.toLowerCase().replace(/[\<\>\"\'\.]/gi, "").indexOf(email) > -1;
            });
            return !!matched;
        }
    }

    var get_emails_for_user = function(user) {
        return /\@/.test(user) ? [user] : name_lookup_inv[user];
    }

    var get_name_for_user = function(user) {
        return /\@/.test(user) ? name_lookup[user] : user;
    }

    var get_duplicate_subject_filter = function(mail_objects) {
        return function(mail_item, index) {
            function standardize(subject) {
                return (subject || "").replace(/(fwd|re)\:/i, "").trim();
            }
            var subject = standardize(mail_item.subject);
            var exists_index = mail_objects.findIndex(function(item) {
                return standardize(item.subject) === subject;
            });
            return exists_index === index;
        }
    }

    var loadLeaderboard = function() {
        $http.get(getResourcePath('/leaderboard')).success(function(data) {
            var leaderboard = data;
            $scope.lastUpdate = new Date();
            $http.get(getResourcePath('/mail')).success(function(data) {
                $scope.mail = data.sort(function(a, b) {
                    return (b.timestamp || 0) - (a.timestamp || 0);
                }).filter(function(mail) {
                    return !!mail.timestamp;
                });

                var earliest_timestamp = $scope.mail[$scope.mail.length - 1].timestamp;
                $scope.loggingSince = earliest_timestamp;
                $scope.loggingDays = Math.ceil(($scope.now - earliest_timestamp) / 1000 / 60 / 60 / 24);

                var filterRow = function(row) {
                    var emails = get_emails_for_user(row.user);
                    var last_email = $scope.mail.find(from_emails(emails)) || {};
                    row.lastActive = last_email.timestamp;
                    row.year = year_lookup[get_name_for_user(row.user) || ""];
                    return !!row.lastActive;
                }

                Object.keys(leaderboard).forEach(function(k) {
                    leaderboard[k] = leaderboard[k].filter(filterRow);
                });
                $scope.leaderboard = leaderboard;

                aggregateClassYears(leaderboard);

                var sample = $scope.mail.slice(0, 100);
                $scope.filterMailSubjects = sample.filter(get_duplicate_subject_filter(sample));
                loadGraph($scope.mail);

            });
        });
    }
    loadMetadata(loadLeaderboard);

    var aggregateClassYears = function(leaderboard) {
        $scope.class_totals = {};
        leaderboard.by_name.forEach(function(row) {
            row.year = year_lookup[get_name_for_user(row.user) || ""];
            if (!row.year) return;
            $scope.class_totals[row.year] = $scope.class_totals[row.year] || { points: 0 };
            $scope.class_totals[row.year].points += row.points;
        });
    }

    var loadGraph = function(mail) {
        var chart_data = [
            [],
            []
        ];
        var prev_date;
        (mail || $scope.mail).reverse()
            .forEach(function(trend, i) {
                prev_date = prev_date || moment(trend.timestamp).format("MMM YYYY");
                var current_date = moment(trend.timestamp).format("MMM YYYY");
                if (i == 0) {
                    chart_data[0].push({ x: current_date, y: 1 });
                    chart_data[1].push({ x: current_date, y: 1 });
                    return;
                }
                if (prev_date === current_date) {
                    chart_data[0][chart_data[0].length - 1].y += 1;
                    chart_data[1][chart_data[1].length - 1].y += 1;
                } else {
                    chart_data[0].push({ x: current_date, y: chart_data[0][chart_data[0].length - 1].y + 1 });
                    chart_data[1].push({ x: current_date, y: 1 });
                    prev_date = current_date;
                }
            });
        $scope.chart_data = chart_data[1];
    }

    $scope.hover = function(row) {
        $scope.selected = row;
        var emails = get_emails_for_user(row.user);
        $scope.filterMail = $scope.mail.filter(from_emails(emails));
        loadGraph($scope.filterMail);
        $scope.filterMailSubjects = $scope.filterMail
            .filter(get_duplicate_subject_filter($scope.filterMail));
    }

    $scope.saveClassYear = function(row) {
        $http.post('/api/class_year', row).success(function(data) {
            loadMetadata(aggregateClassYears);
        });
    }

});