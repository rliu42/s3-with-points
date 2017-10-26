var app = angular.module('pointsApp', ['ngMaterial', 'chart.js']);
var now = (new Date).getTime();
const timezone = "America/New_York";

var getResourcePath = function(resource) {
    var base_url = /file|localhost/.test(location.href) ? "http://localhost:1011/api" : "http://72.29.29.198:1011/api";
    return base_url + resource;
}

Chart.defaults.global.defaultFontFamily = 'Ubuntu, sans-serif';
Chart.defaults.global.animation.duration = 300;

app.controller('MainController', function($scope, $http, $interval, $timeout, $window, $document) {

    $scope.now = new Date().getTime();

    $http.get(getResourcePath('/leaderboard')).success(function(data) {
        $scope.leaderboard = data;
        $scope.lastUpdate = moment().tz(timezone).format('MMM D, h:mma') + " ET";
        $http.get(getResourcePath('/mail')).success(function(data) {
            $scope.mail = data.sort(function(a, b) {
                return (b.timestamp || 0) - (a.timestamp || 0);
            });
            var has_timestamp = $scope.mail.filter(function(mail) {
                return !!mail.timestamp;
            });
            var earliest_date = has_timestamp[has_timestamp.length - 1].timestamp;
            $scope.loggingSince = moment(earliest_date).tz(timezone).format('MMM D, YYYY');
            $scope.loggingDays = Math.ceil(($scope.now - earliest_date) / 1000 / 60 / 60 / 24);
            $scope.leaderboard = $scope.leaderboard.filter(function(row) {
                var lastActive = ($scope.mail.find(function(item) {
                    return item.from && item.from[0] && item.from[0].address &&
                        item.from[0].address.replace(/[\"\'\.]/gi, "").indexOf(row.user) > -1;
                }) || {}).timestamp;
                row.lastActive = lastActive;
                return !!lastActive;
            });
        });
    });

    $scope.hover = function(row) {
        $scope.selected = row;
        $scope.filterMail = $scope.mail.filter(function(item) {
            return item.from && item.from[0] && item.from[0].address && 
            item.from[0].address.replace(/[\"\'\.]/gi, "").indexOf(row.user) > -1;
        });
        $scope.filterStats = {
            emails: $scope.filterMail.length,
        }
        $scope.filterMail = $scope.filterMail.filter(function(item, index) {
            var subject = item.subject.replace(/(fwd|re)\:/i, "").trim();
            var existing_index = $scope.filterMail.findIndex(function(item) {
                return item.subject.replace(/(fwd|re)\:/i, "").trim() === subject;
            });
            return existing_index === index;
        });
        $scope.filterStats.threads = $scope.filterMail.length;
    }

});