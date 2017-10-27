var app = angular.module('pointsApp', ['ngMaterial', 'chart.js']);
app.config(function($mdThemingProvider) {
    $mdThemingProvider.theme('default')
        .primaryPalette('blue')
        .accentPalette('orange');
});
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
                    fontSize: 14,
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
                    return " " + ti.yLabel + " Email" + (parseInt(ti.yLabel) == 1 ? "" : "s")
                }
            }
        }
    };
});

app.controller('MainController', function($scope, $http, $interval, $timeout, $window, $document) {

    $scope.now = new Date().getTime();
    $scope.is_mobile = /phone|mobile|android/i.test(navigator.userAgent);

    var loadClassYears = function() {
        $scope.class_years = [];
        for (var y = 2012; y <= new Date().getFullYear() + 4; y++) {
            $scope.class_years.push(y);
        }
    }
    loadClassYears();

    $scope.selected_view = "by_name";
    $scope.candidate_lists;
    $scope.list_opts = {};
    var loadConfigs = function() {
        $http.get(getResourcePath('/constants')).success(function(data) {
            $scope.configs = data;
            $scope.candidate_lists = data.MAILING_LISTS.map(function(list) {
                return list.replace("@mit.edu", "").toLowerCase();
            });
            $scope.candidate_lists.forEach(function(list) {
                $scope.list_opts[list] = true;
            });
        }).error(function(err) {
            console.error(err);
            $scope.candidate_lists = ["safetythird", "who-said-it-in-safetythird", "thad-ideas"];
            $scope.candidate_lists.forEach(function(list) {
                $scope.list_opts[list] = true;
            });
        });
    }
    loadConfigs();

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

    var loadMail = function(callback) {
        $http.get(getResourcePath('/mail'))
            .success(function(data) {
                console.log("received mail");
                $scope.mail = data;
                var earliest_timestamp = $scope.mail[$scope.mail.length - 1].timestamp;
                $scope.loggingSince = earliest_timestamp;
                $scope.loggingDays = Math.ceil(($scope.now - earliest_timestamp) / 1000 / 60 / 60 / 24);
                if ($scope.leaderboard) {
                    Object.keys($scope.leaderboard).forEach(function(k) {
                        $scope.leaderboard[k] = $scope.leaderboard[k].filter(filterRow);
                    });
                }
                if (callback) callback();
            }).error(console.error);
    }

    var filterRow = function(row) {
        var emails = get_emails_for_user(row.user);
        var last_email = $scope.mail.find(from_emails(emails)) || {};
        row.lastActive = last_email.timestamp;
        row.year = year_lookup[get_name_for_user(row.user) || ""];
        return !!row.lastActive;
    }

    var loadLeaderboard = function(params) {
        var config = {};
        if (params) config.params = params;
        var keyParams = function(params) {
            return $scope.candidate_lists.filter(function(list) {
                return !!params[list];
            }).toString();
        }
        if (params && leaderboardCache[keyParams(params)]) {
            $scope.leaderboard = leaderboardCache[keyParams(params)];
            aggregateClassYears($scope.leaderboard);
            $scope.pending = false;
            console.log("cached leaderboard");
            return;
        }
        $scope.leaderboard = null;
        $http.get(getResourcePath('/leaderboard'), config)
            .success(function(data) {
                var leaderboard = data;
                $scope.lastUpdate = new Date();

                if ($scope.mail) {
                    Object.keys(leaderboard).forEach(function(k) {
                        leaderboard[k] = leaderboard[k].filter(filterRow);
                    });
                }
                $scope.leaderboard = leaderboard;
                $scope.pending = false;

                aggregateClassYears($scope.leaderboard);
                leaderboardCache[keyParams($scope.list_opts)] = leaderboard;
            }).error(console.error);
    }

    var filterMailForLists = function(candidate_lists) {
        return $scope.mail.filter(function(mail) {
            var rcps = (mail.cc || []).concat(mail.to || []);
            var matched_rcp = rcps.find(function(rcp) {
                return candidate_lists.indexOf((rcp.address || "").toLowerCase()) > -1;
            });
            return !!matched_rcp;
        });
    }

    var leaderboardCache = {};

    loadMetadata(function() {
        loadLeaderboard();
        loadMail(function() {
            loadGraph($scope.mail);
            var unique = {};

            function standardize(subject) {
                return (subject || "").replace(/(fwd|re)\:/i, "").trim();
            }
            $scope.filterMailSubjects = [];
            $scope.mail.forEach(function(mail) {
                var std_subject = standardize(mail.subject);
                if (!unique[std_subject]) {
                    $scope.filterMailSubjects.push(mail);
                    unique[std_subject] = true;
                }
            });
        });
    });

    $scope.reloadLeaderboard = function() {
        $scope.selected = null;
        $scope.pending = true;
        loadLeaderboard($scope.list_opts);
        reloadMail();
    }

    var reloadMail = function() {
        var candidate_lists = Object.keys($scope.list_opts)
            .filter(function(k) {
                return !!$scope.list_opts[k];
            }).map(function(list) {
                return list.toLowerCase() + "@mit.edu";
            });

        $scope.filter_mail = filterMailForLists(candidate_lists);
        loadGraph($scope.filter_mail);

        var unique = {};

        function standardize(subject) {
            return (subject || "").replace(/(fwd|re)\:/i, "").trim();
        }
        $scope.filterMailSubjects = [];
        $scope.filter_mail.forEach(function(mail) {
            var std_subject = standardize(mail.subject);
            if (!unique[std_subject]) {
                $scope.filterMailSubjects.push(mail);
                unique[std_subject] = true;
            }
        });
    }

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
        (mail || $scope.mail)
        .forEach(function(trend, i) {
            prev_date = prev_date || moment(trend.timestamp).format("MMM YYYY");
            var current_date = moment(trend.timestamp).format("MMM YYYY");
            if (i == 0) {
                var month_diff = Math.floor(
                    moment(new Date()).diff(moment(trend.timestamp), 'months', true)
                );
                for (var j = 1; j < month_diff; j++) {
                    var filler_date = moment(trend.timestamp).add(j, 'months').format("MMM YYYY");
                    chart_data[1].push({ x: filler_date, y: 0 });
                }
                chart_data[0].push({ x: current_date, y: 1 });
                chart_data[1].push({ x: current_date, y: 1 });
                return;
            }
            if (prev_date === current_date) {
                chart_data[0][chart_data[0].length - 1].y += 1;
                chart_data[1][chart_data[1].length - 1].y += 1;
            } else {
                var month_diff = Math.floor(
                    moment((mail || $scope.mail)[i - 1].timestamp).diff(moment(trend.timestamp), 'months', true)
                );
                for (var j = 1; j < month_diff; j++) {
                    var filler_date = moment(trend.timestamp).add(j, 'months').format("MMM YYYY");
                    chart_data[1].push({ x: filler_date, y: 0 });
                }
                chart_data[0].push({ x: current_date, y: chart_data[0][chart_data[0].length - 1].y + 1 });
                chart_data[1].push({ x: current_date, y: 1 });
                prev_date = current_date;
            }
        });
        chart_data[1].sort(function(a, b) {
            return moment(a.x) - moment(b.x);
        });
        $scope.chart_data = chart_data[1];
    }

    $scope.hover = function(row) {
        if (!$scope.filter_mail && !$scope.mail) return;
        $scope.selected = row;
        var emails = get_emails_for_user(row.user);
        $scope.filter_user_mail = ($scope.filter_mail || $scope.mail).filter(from_emails(emails));
        loadGraph($scope.filter_user_mail);
        $scope.filterMailSubjects = $scope.filter_user_mail
            .filter(get_duplicate_subject_filter($scope.filter_user_mail));
    }

    $scope.saveClassYear = function(row) {
        $http.post('/api/class_year', row).success(function(data) {
            loadMetadata(aggregateClassYears);
        });
    }

});