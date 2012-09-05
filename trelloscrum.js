/*
** TrelloScrum v1.1 - https:// github.com/Q42/TrelloScrum
** Adds Scrum to your Trello
**
** Original:
** Jasper Kaizer <https:// github.com/jkaizer>
** Marcel Duin <https:// github.com/marcelduin>
**
** Contribs:
** Paul Lofte <https:// github.com/paullofte>
** Nic Pottier <https:// github.com/nicpottier>
** Bastiaan Terhorst <https:// github.com/bastiaanterhorst>
** Morgan Craft <https:// github.com/mgan59>
** Frank Geerlings <https:// github.com/frankgeerlings>
** Cedric Gatay <https:// github.com/CedricGatay>
** Brandon Martinez <https:// github.com/brandonmartinez>
*/

/*global jQuery, $, chrome, BlobBuilder */


var pointSeq = ['?', 0, 1, 2, 3, 5, 8, 13, 20], // default story point picker sequence
    pointsAttr = ['cpoints', 'points'], // attributes representing points values for card
    filtered = false, // watch for filtered cards
    reg = /[\(](\x3f|\d*\.?\d+)([\)])\s?/m, // parse regexp- accepts digits, decimals and '?', surrounded by ()
    regC = /[\[](\x3f|\d*\.?\d+)([\]])\s?/m, // parse regexp- accepts digits, decimals and '?', surrounded by []
    iconUrl = chrome.extension.getURL('images/storypoints-icon.png'),
    pointsDoneUrl = chrome.extension.getURL('images/points-done.png'),
    Utils = (function () {
        'use strict';
        function roundValue(val) {
            return (Math.floor(val * 100) / 100);
        }

        return {
            roundValue: roundValue
        };
    } ()),
    $excel_btn, $excel_dl;

window.URL = window.webkitURL || window.URL;
window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;

$(function () {
    'use strict';

    // private functions

    // .list-card pseudo
    function ListCard(el, identifier) {
        if (el.listCard && el.listCard[identifier]) {
            return;
        }
        // lazily create object
        if (!el.listCard) {
            el.listCard = {};
        }
        el.listCard[identifier] = this;

        var points = -1,
		consumed = identifier !== 'points',
		regexp = consumed ? regC : reg,
		parsed,
		that = this,
		busy = false,
		to,
		$card = $(el),
		$badge = $('<div class="badge badge-points point-count" style="background-image: url(' + iconUrl + ')"/>')
			.bind('DOMSubtreeModified DOMNodeRemovedFromDocument', function (e) {
			    if (busy) {
			        return;
			    }
			    busy = true;
			    clearTimeout(to);
			    to = setTimeout(function () {
			        $badge.prependTo($card.find('.badges'));
			        busy = false;
			    });
			});

        this.refresh = function () {
            var $title = $card.find('a.list-card-title'), title;
            if (!$title[0]) {
                return;
            }
            title = $title[0].text;
            parsed = title.match(regexp);
            points = parsed ? parsed[1] : -1;
            if ($card.parent()[0]) {
                $title[0].textContent = title.replace(regexp, '');
                $badge.text(that.points);

                if (consumed) {
                    $badge.addClass("consumed");
                }
                else {
                    $badge.removeClass('consumed');
                }

                $badge.attr({ title: 'This card has ' + that.points + (consumed ? ' consumed' : '') + ' storypoint' + (that.points === 1 ? '.' : 's.') });
            }
        };

        this.__defineGetter__('points', function () {
            // don't add to total when filtered out
            return parsed && (!filtered || ($card.css('opacity') === 1 && $card.css('display') !== 'none')) ? points : '';
        });

        this.refresh();
    }

    // .list pseudo
    function List(el) {
        if (el.list) {
            return;
        }

        el.list = this;

        var $list = $(el),
                to,
                to2,
                $total = $('<span class="list-total">')
		.bind('DOMNodeRemovedFromDocument', function () {
		    clearTimeout(to);
		    to = setTimeout(function () {
		        $total.appendTo($list.find('.list-header h2'));
		    });
		})
		.appendTo($list.find('.list-header h2'));

        function readCard($c) {
            $c.each(function () {
                var that = this,
                        to22,
                        busy = false,
                        i,
                        attr;
                if ($(that).hasClass('placeholder')) {
                    return;
                }
                if (!that.listCard) {
                    that.listCard = [];
                    for (i in pointsAttr) {
                        if (pointsAttr.hasOwnProperty(i)) {
                            attr = pointsAttr[i];

                            that.listCard.push(new ListCard(that, attr));
                        }
                    }

                    $(that).bind('DOMNodeInserted', function (e) {
                        if (!busy && ($(e.target).hasClass('list-card-title') || e.target === that)) {
                            clearTimeout(to22);
                            to22 = setTimeout(function () {
                                var c, card;
                                busy = true;

                                for (c in that.listCard) {
                                    if (that.listCard.hasOwnProperty(c)) {
                                        card = that.listCard[c];

                                        card.refresh();
                                    }
                                }

                                busy = false;
                            });
                        }
                    });
                }
            });
        }

        $list.bind('DOMNodeInserted', function (e) {
            if ($(e.target).hasClass('list-card') && !e.target.listCard) {
                clearTimeout(to2);
                to2 = setTimeout(readCard, 0, $(e.target));
            }
        });

        this.calc = function () {
            var i, score, attr, scoreTruncated;
            $total.empty();

            function findListCards(elements) {
                elements.each(function () {
                    if (this.listCard && !isNaN(Number(this.listCard[attr].points))) {
                        score += Number(this.listCard[attr].points);
                    }
                });
            }

            for (i in pointsAttr) {
                if (pointsAttr.hasOwnProperty(i)) {
                    attr = pointsAttr[i];
                    score = 0;
                    findListCards($list.find('.list-card'));
                    scoreTruncated = Utils.roundValue(score);
                    $total.append('<span class="' + attr + '">' + (scoreTruncated > 0 ? scoreTruncated : '') + '</span>');
                }
            }
        };

        readCard($list.find('.list-card'));
        this.calc();
    }

    // forcibly calculate list totals
    function calcPoints($el) {
        ($el || $('.list')).each(function () {
            if (this.list) {
                this.list.calc();
            }
        });
    }

    function showExcelExport() {
        $excel_btn.text('Generating...');

        $.getJSON($('form').find('.js-export-json').attr('href'), function (data) {
            var s, bb, boardTitleReg, boardTitleParsed, boardTitle, evt;

            s = '<table id="export" border=1>'
                + '<tr><th>Points</th><th>Story</th><th>Description</th></tr>';

            $.each(data.lists, function (key, list) {
                var listId = list.id;
                s += '<tr><th colspan="3">' + list.name + '</th></tr>';

                $.each(data.cards, function (key, card) {
                    if (card.idList === listId) {
                        var title = card.name,
                            parsed = title.match(reg),
                            points = parsed ? parsed[1] : '';
                        title = title.replace(reg, '');
                        s += '<tr><td>' + points + '</td><td>' + title + '</td><td>' + card.desc + '</td></tr>';
                    }
                });
                s += '<tr><td colspan=3></td></tr>';
            });
            s += '</table>';


            bb = new BlobBuilder();
            bb.append(s);

            boardTitleReg = '/.*\/board\/(.*)\//';
            boardTitleParsed = document.location.href.match(boardTitleReg);
            boardTitle = boardTitleParsed[1];

            $excel_btn
			.text('Excel')
			.after(
				$excel_dl = $('<a>')
					.attr({
					    download: boardTitle + '.xls',
					    href: window.URL.createObjectURL(bb.getBlob('application/ms-excel'))
					})
			);

            evt = document.createEvent('MouseEvents');
            evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
            $excel_dl[0].dispatchEvent(evt);
            $excel_dl.remove();

        });

        return false;
    }

    function checkExport() {
        if ($('form').find('.js-export-excel').length) {
            return;
        }

        var $jsBtn = $('form').find('.js-export-json');
        if ($jsBtn.length) {
            $excel_btn = $('<a>')
			.attr({
			    style: 'margin: 0 4px 4px 0;',
			    'class': 'button js-export-excel',
			    href: '#',
			    target: '_blank',
			    title: 'Open downloaded file with Excel'
			})
			.text('Excel')
			.click(showExcelExport)
			.insertAfter($jsBtn);
        }

    }

    function computeTotal() {
        var $title = $(".board-title"),
            $total = $(".board-title .list-total"),
            p,
            attr,
            score,
            $countElem;

        if ($total.length === 0) {
            $total = $("<span class='list-total'>").appendTo($title);
        }

        function findListTotals(elements) {
            elements.each(function () {
                var value = $(this).text();
                if (value && !isNaN(value)) {
                    score += parseFloat(value);
                }
            });
        }

        for (p in pointsAttr) {
            if (pointsAttr.hasOwnProperty(p)) {
                score = 0;
                attr = pointsAttr[p];

                findListTotals($("#board .list-total ." + attr));

                $countElem = $('.board-title .list-total .' + attr);
                if ($countElem.length > 0) {
                    $countElem.remove();
                }
                $total.append("<span class='" + attr + "'>" + Utils.roundValue(score) + "</span>");
            }
        }
    }

    function readList($c) {
        $c.each(function () {
            if (!this.list) {
                this.list = new List(this);
            }
            else if (this.list.calc) {
                this.list.calc();
            }
        });
    }

    // jQuery Events

    // watch filtering
    $(document).on('mouseup', '.js-filter-toggle', function (e) {
        setTimeout(function () {
            filtered = $('.js-filter-cards').hasClass('is-on');
            calcPoints();
        });
    });

    // for storypoint picker
    $(document).on('DOMNodeInserted', '.card-detail-title .edit-controls', function () {
        if ($(this).find('.picker').length) {
            return;
        }

        var $picker = $('<div class="picker">').appendTo('.card-detail-title .edit-controls'),
            value,
            $text,
            text,
            p, point;
        
        function registerClickEvent(element) {
            element.click(function () {
                    value = $(this).text();
                    $text = $('.card-detail-title .edit textarea');
                    text = $text.val();

                    // replace our new
                    $text[0].value = text.match(reg) ? text.replace(reg, '(' + value + ') ') : '(' + value + ') ' + text;

                    // then click our button so it all gets saved away
                    $(".card-detail-title .edit .js-save-edit").click();

                    return false;
                });
        }

        for (p in pointSeq) {
            if (pointSeq.hasOwnProperty(p)) {
                point = pointSeq[p];

                registerClickEvent($picker.append($('<span class="point-value">').text(point)));
            }
        }
    });

    $('body').bind('DOMSubtreeModified', function (e) {
        if ($(e.target).hasClass('list')) {
            readList($(e.target));
            computeTotal();
        }
    });

    $(document).on('mouseup', '.js-share', function () {
        setTimeout(checkExport);
    });

    readList($('.list'));
});