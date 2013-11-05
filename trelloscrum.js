/*
** Scrum for Trello- https://github.com/Q42/TrelloScrum
** Adds Scrum to your Trello
**
** Original:
** Jasper Kaizer <https://github.com/jkaizer>
** Marcel Duin <https://github.com/marcelduin>
**
** Contribs:
** Paul Lofte <https://github.com/paullofte>
** Nic Pottier <https://github.com/nicpottier>
** Bastiaan Terhorst <https://github.com/bastiaanterhorst>
** Morgan Craft <https://github.com/mgan59>
** Frank Geerlings <https://github.com/frankgeerlings>
** Cedric Gatay <https://github.com/CedricGatay>
** Kit Glennon <https://github.com/kitglen>
** Samuel Gaus <https://github.com/gausie>
** Sean Colombo <https://github.com/seancolombo>
**
*/

// Thanks @unscriptable - http://unscriptable.com/2009/03/20/debouncing-javascript-methods/
var debounce = function (func, threshold, execAsap) {
    var timeout;
    return function debounced () {
    	var obj = this, args = arguments;
		function delayed () {
			if (!execAsap)
				func.apply(obj, args);
			timeout = null; 
		};

		if (timeout)
			clearTimeout(timeout);
		else if (execAsap)
			func.apply(obj, args);

		timeout = setTimeout(delayed, threshold || 100); 
	};
}

// For MutationObserver
var obsConfig = { childList: true, characterData: true, attributes: false, subtree: true };

//default story point picker sequence
var _pointSeq = ['?', 0, .5, 1, 2, 3, 5, 8, 13, 21];
//attributes representing points values for card
var _pointsAttr = ['cpoints', 'points'];


//internals
var reg = /((?:^|\s))\((\x3f|\d*\.?\d+)(\))\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by ()
    regC = /((?:^|\s))\[(\x3f|\d*\.?\d+)(\])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by []
    iconUrl,
    pointsDoneUrl;
if(typeof chrome !== 'undefined'){
    // Works in Chrome
	iconUrl = chrome.extension.getURL('images/storypoints-icon.png');
	pointsDoneUrl = chrome.extension.getURL('images/points-done.png');
    flameUrl = chrome.extension.getURL('images/burndown_for_trello_icon_12x12.png');
    flame18Url = chrome.extension.getURL('images/burndown_for_trello_icon_18x18.png');
} else {
	// Works in Firefox Add-On
	if(typeof self.options != 'undefined'){ // options defined in main.js
		iconUrl = self.options.iconUrl;
		pointsDoneUrl = self.options.pointsDoneUrl;
        flameUrl = self.options.flameUrl;
        flame18Url = self.options.flame18Url;
	}
}
function round(_val) {return (Math.floor(_val * 100) / 100)};

// Comment out before release - makes cross-browser debugging easier.
//function log(msg){
//	if(typeof chrome !== 'undefined'){
//		console.log(msg);
//	} else {
//		$($('.header-btn-text').get(0)).text(msg);
//	}
//}

//what to do when DOM loads
$(function(){
	//watch filtering
	function updateFilters() {
		setTimeout(calcListPoints);
	};
	$('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').live('mouseup', calcListPoints);
	$('.js-input').live('keyup', calcListPoints);
	$('.js-share').live('mouseup',function(){
		setTimeout(checkExport,500)
	});

	calcListPoints();
});

// Recalculates every card and its totals (used for significant DOM modifications).
var recalcListAndTotal = debounce(function($el){
    ($el||$('.list')).each(function(){
		if(!this.list) new List(this);
		else if(this.list.refreshList){
			this.list.refreshList(); // make sure each card's points are still accurate (also calls list.calc()).
		}
	})
}, 500, false);

var recalcTotalsObserver = new MutationObserver(function(mutations)
{	
	// Determine if the mutation event included an ACTUAL change to the list rather than
	// a modification caused by this extension making an update to points, etc. (prevents
	// infinite recursion).
	var doFullRefresh = false;
	var refreshJustTotals = false;
	$.each(mutations, function(index, mutation){
		var $target = $(mutation.target);

		// Ignore a bunch of known cases that send mutation events which don't require us to recalcListAndTotal.
		if(! ($target.hasClass('list-total')
			  || $target.hasClass('list-title')
			  || $target.hasClass('date') // the 'time-ago' functionality changes date spans every minute
			  || $target.hasClass('js-phrase') // this is constantly updated by Trello, but doesn't affect estimates.
              || $target.hasClass('member')
              || $target.hasClass('clearfix')
              || $target.hasClass('badges')
			  || $target.hasClass('header-btn-text')
              || (typeof mutation.target.className == "undefined")
			  ))
		{
			if($target.hasClass('badge')){
                if(!$target.hasClass("consumed")){
    				refreshJustTotals = true;
                }
			} else {
				// It appears this was an actual modification and not a recursive notification.
				doFullRefresh = true;
			}
		}
	});
	
	if(doFullRefresh){
		recalcListAndTotal();
	} else if(refreshJustTotals){
		calcListPoints();
	}
    
    $editControls = $(".card-detail-title .edit-controls");
    if($editControls.length > 0)
    {
        showPointPicker($editControls.get(0));
    }
});
recalcTotalsObserver.observe(document.body, obsConfig);

// Refreshes the link to the Burndown Chart dialog.
function updateBurndownLink(){
    // Add the link for Burndown Charts
    //$('#burndownLink').remove();
    if($('#burndownLink').length === 0){
        $('#board-header a').last().after("<a id='burndownLink' class='quiet ed board-header-btn dark-hover' href='#'><span class='icon-sm'><img src='"+flameUrl+"' width='12' height='12'/></span><span class='text'>Burndown Chart</span></a>");
        $('#burndownLink').click(showBurndown);
    }
}

var ignoreClicks = function(){ return false; };
function showBurndown()
{
    $('body').addClass("window-up");
    $('.window').css("display", "block").css("top", "50px");

	// Figure out the current user and board.
	$memberObj = $('.header-user .member-avatar');
	if($memberObj.length == 0){
		$memberObj = $('.header-user .member-initials'); // if the user doesn't have an icon
	}
	var username = $memberObj.attr('title').match(/\((.*?)\)$/)[1];

	// Some cards have the board-id in them.
	var boardId = "";
	$('.action-card').each(function(i, el){
		var matches = $(el).attr('href').match(/\/([0-9a-f]{24})/);
		if(matches){
			boardId = matches[1];
		}
	});
	var shortLink = document.location.href.match(/b\/([A-Za-z0-9]{8})\//)[1];
	var boardName = "";
	if(boardId == ""){ // if there was no boardId found, then pass in the board-name which will be used as a fallback.
		boardName = $('.board-name span.text').text().trim();
	}

	// Build the dialog DOM elements. There are no unescaped user-provided strings being used here.
	var clearfix = $('<div/>', {class: 'clearfix'});
	var windowHeaderUtils = $('<div/>', {class: 'window-header-utils'}).append( $('<a/>', {class: 'icon-lg icon-close dark-hover js-close-window', href: '#', title:'Close this dialog window.'}) );
	var iFrameWrapper = $('<div/>', {style: 'padding:10px; padding-top: 13px;'});
    var flameIcon = $('<img/>', {style: 'position:absolute; margin-left: 20px; margin-top:15px;', src:flame18Url});
    
	var actualIFrame = $('<iframe/>', {frameborder: '0',
						 style: 'width: 670px; height: 512px;',
						 id: 'burndownFrame',
						 src: "http://www.burndownfortrello.com/s4t_burndownPopup.php?boardId="+encodeURIComponent(boardId)+"&username="+encodeURIComponent(username)+"&shortLink="+encodeURIComponent(shortLink)+"&boardName="+encodeURIComponent(boardName)
						});
	var loadingFrameIndicator = $('<span/>', {class: 'js-spinner', id: 'loadingBurndownFrame', style: 'position: absolute; left: 225px; top: 260px;'}).append($('<span/>', {class: 'spinner left', style: 'margin-right:4px;'})).append("Loading 'Burndown for Trello'...");
	iFrameWrapper.append(loadingFrameIndicator); // this will show that the iframe is loading... until it loads.
	iFrameWrapper.append(actualIFrame);
    actualIFrame.css("visibility", "hidden");
	$windowWrapper = $('.window-wrapper');
    $windowWrapper.click(ignoreClicks);
	$windowWrapper.empty().append(clearfix).append(flameIcon).append(windowHeaderUtils).append(iFrameWrapper);
	$('#burndownFrame').load(function(){ $('#loadingBurndownFrame').remove(); actualIFrame.css("visibility", "visible"); }); // once the iframe loads, get rid of the loading indicator.
	$('.window-header-utils a.js-close-window').click(hideBurndown);
    $(window).bind('resize', repositionBurndown);
    $('.window-overlay').bind('click', hideBurndown);
    
    repositionBurndown();
}

function hideBurndown()
{
    $('body').removeClass("window-up");
    $('.window').css("display", "none");
    $(window).unbind('resize', repositionBurndown);
	$('.window-header-utils a.js-close-window').unbind('click', hideBurndown);
	$('.window-wrapper').unbind('click', ignoreClicks);
    $('.window-overlay').unbind('click', hideBurndown);
}

function repositionBurndown()
{
    windowWidth = $(window).width();
    if(windowWidth < 0) // todo change this to a n actual number (probably 710 or so)
    {
        // todo shrink our iframe to an appropriate size.  contents should wrap
    }
    else
    {
        burndownWindowWidth = 690;
        leftPadding = (windowWidth - burndownWindowWidth) / 2.0;
        $('.window').css("left", leftPadding);
    }
}

//calculate board totals
var ctto;
function computeTotal(){
	clearTimeout(ctto);
	ctto = setTimeout(function(){
		var $title = $('#board-header');
		var $total = $title.children('.list-total').empty();
		if ($total.length == 0)
			$total = $('<span/>', {class: "list-total"}).appendTo($title);

		for (var i in _pointsAttr){
			var score = 0,
				attr = _pointsAttr[i];
			$('#board .list-total .'+attr).each(function(){
				score+=parseFloat(this.textContent)||0;
			});
			var scoreSpan = $('<span/>', {class: attr}).text(round(score)||'');
			$total.append(scoreSpan);
		}
        
        updateBurndownLink(); // the burndown link and the total are on the same bar... so now they'll be in sync as to whether they're both there or not.
	});
};

//calculate list totals
var lto;
function calcListPoints(){
	clearTimeout(lto);
	lto = setTimeout(function(){
		$('.list').each(function(){
			if(!this.list) new List(this);
			else if(this.list.calc) this.list.calc();
		});
	});
};

//.list pseudo
function List(el){
	if(el.list)return;
	el.list=this;

	var $list=$(el),
		$total=$('<span class="list-total">'),
		busy = false,
		to,
		to2;

	function readCard($c){
		if($c.target) {
			if(!/list-card/.test($c.target.className)) return;
			$c = $($c.target).filter('.list-card:not(.placeholder)');
		}
		$c.each(function(){
			if(!this.listCard) for (var i in _pointsAttr)
				new ListCard(this,_pointsAttr[i]);
			else for (var i in _pointsAttr)
				setTimeout(this.listCard[_pointsAttr[i]].refresh);
		});
	};

	// All calls to calc are throttled to happen no more than once every 500ms (makes page-load and recalculations much faster).
	var self = this;
	this.calc = debounce(function(){
		self._calcInner();
    }, 500, true); // executes right away unless over its 500ms threshold since the last execution
	this._calcInner	= function(e){ // don't call this directly. Call calc() instead.
		//if(e&&e.target&&!$(e.target).hasClass('list-card')) return; // TODO: REMOVE - What was this? We never pass a param into this function.
		clearTimeout(to);
		to = setTimeout(function(){
			$total.empty().appendTo($list.find('.list-title'));
			for (var i in _pointsAttr){
				var score=0,
					attr = _pointsAttr[i];
				$list.find('.list-card:not(.placeholder)').each(function(){
					if(!this.listCard) return;
					if(!isNaN(Number(this.listCard[attr].points))){
						// Performance note: calling :visible in the selector above leads to noticible CPU usage.
						if(jQuery.expr.filters.visible(this)){
							score+=Number(this.listCard[attr].points);
						}
					}
				});
				var scoreTruncated = round(score);
				var scoreSpan = $('<span/>', {class: attr}).text( (scoreTruncated>0) ? scoreTruncated : '' );
				$total.append(scoreSpan);
				computeTotal();
			}
		});
	};
    
    this.refreshList = debounce(function(){
    		readCard($list.find('.list-card:not(.placeholder)'));
            this.calc(); // readCard will call this.calc() if any of the cards get refreshed.
    }, 500, false);

	var cardAddedRemovedObserver = new MutationObserver(function(mutations)
	{
		// Determine if the mutation event included an ACTUAL change to the list rather than
		// a modification caused by this extension making an update to points, etc. (prevents
		// infinite recursion).
		$.each(mutations, function(index, mutation){
			var $target = $(mutation.target);
			
			// Ignore a bunch of known elements that send mutation events.
			if(! ($target.hasClass('list-total')
					|| $target.hasClass('list-title')
					|| $target.hasClass('badge-points')
					|| $target.hasClass('badges')
					|| (typeof mutation.target.className == "undefined")
					))
			{
				var list;
				// It appears this was an actual mutation and not a recursive notification.
				$list = $target.closest(".list");
				if($list.length > 0){
					list = $list.get(0).list;
					if(!list){
						list = new List(mutation.target);
					}
					if(list){
						list.refreshList(); // debounced, so its safe to call this multiple times for the same list in this loop.
					}
				}
			}
		});
	});

    cardAddedRemovedObserver.observe($list.get(0), obsConfig);

	setTimeout(function(){
		readCard($list.find('.list-card'));
		setTimeout(el.list.calc);
	});
};

//.list-card pseudo
function ListCard(el, identifier){
	if(el.listCard && el.listCard[identifier]) return;

	//lazily create object
	if (!el.listCard){
		el.listCard={};
	}
	el.listCard[identifier]=this;

	var points=-1,
		consumed=identifier!=='points',
		regexp=consumed?regC:reg,
		parsed,
		that=this,
		busy=false,
		$card=$(el),
		$badge=$('<div class="badge badge-points point-count" style="background-image: url('+iconUrl+')"/>'),
		to,
		to2;

	// MutationObservers may send a bunch of similar events for the same card (also depends on browser) so
	// refreshes are debounced now.
	var self = this;
	this.refresh = debounce(function(){
		self._refreshInner();
    }, 250, true); // executes right away unless over its 250ms threshold
	this._refreshInner=function(){
		if(busy) return;
		busy = true;
		clearTimeout(to);
		to = setTimeout(function(){
			var $title=$card.find('a.list-card-title');
			if(!$title[0])return;
			var titleTextContent = $title[0].childNodes[1].textContent;
			if(titleTextContent) el._title = titleTextContent;
			
			// Get the stripped-down (parsed) version without the estimates, that was stored after the last change.
			var parsedTitle = $title.data('parsed-title'); 
			if(titleTextContent != parsedTitle){
				// New card title, so we have to parse this new info to find the new amount of points.
				parsed=titleTextContent.match(regexp);
				points=parsed?parsed[2]:-1;
			} else {
				// Title text has already been parsed... process the pre-parsed title to get the correct points.
				var origTitle = $title.data('orig-title');
				parsed=origTitle.match(regexp);
				points=parsed?parsed[2]:-1;
			}

			clearTimeout(to2);
			to2 = setTimeout(function(){
				// Add the badge (for this point-type: regular or consumed) to the badges div.
				$badge
					.text(that.points)
					[(consumed?'add':'remove')+'Class']('consumed')
					.attr({title: 'This card has '+that.points+ (consumed?' consumed':'')+' storypoint' + (that.points == 1 ? '.' : 's.')})
					.prependTo($card.find('.badges'));

				// Update the DOM element's textContent and data if there were changes.
				if(titleTextContent != parsedTitle){
					$title.data('orig-title', titleTextContent); // store the non-mutilated title (with all of the estimates/time-spent in it).
				}
				parsedTitle = $.trim(el._title.replace(reg,'$1').replace(regC,'$1'));
				el._title = parsedTitle;
				$title.data('parsed-title', parsedTitle); // save it to the DOM element so that both badge-types can refer back to it.
				$title[0].childNodes[1].textContent = parsedTitle;
				var list = $card.closest('.list');
				if(list[0]){
					list[0].list.calc();
				}
				busy = false;
			});
		});
	};

	this.__defineGetter__('points',function(){
		return parsed?points:''
	});

	var cardShortIdObserver = new MutationObserver(function(mutations){
		$.each(mutations, function(index, mutation){
			var $target = $(mutation.target);
			if(mutation.addedNodes.length > 0){
				$.each(mutation.addedNodes, function(index, node){
					if($(node).hasClass('card-short-id')){
						// Found a card-short-id added to the DOM. Need to refresh this card.
						var listElement = $target.closest('.list').get(0);
						if(!listElement.list) new List(listElement); // makes sure the .list in the DOM has a List object

						var $card = $target.closest('.list-card');
						if($card.length > 0){
							var listCardHash = $card.get(0).listCard;
							if(listCardHash){
								// The hash contains a ListCard object for each type of points (cpoints, points, possibly more in the future).
								$.each(_pointsAttr, function(index, pointsAttr){
									listCardHash[pointsAttr].refresh();
								});
							}
						}
					}
				});
			}
		});
	});

	// The MutationObserver is only attached once per card (for the non-consumed-points ListCard) and that Observer will make the call
	// to update BOTH types of points-badges.
	if(!consumed){
		var observerConfig = { childList: true, characterData: false, attributes: false, subtree: true };
		cardShortIdObserver.observe(el, observerConfig);
	}

	setTimeout(that.refresh);
};

//the story point picker
function showPointPicker(location) {
	if($(location).find('.picker').length) return;
	var $picker = $('<div/>', {class: "picker"}).appendTo('.card-detail-title .edit-controls');
	for (var i in _pointSeq) $picker.append($('<span>', {class: "point-value"}).text(_pointSeq[i]).click(function(){
		var value = $(this).text();
		var $text = $('.card-detail-title .edit textarea');
		var text = $text.val();

		// replace our new
		$text[0].value=text.match(reg)?text.replace(reg, '('+value+') '):'('+value+') ' + text;

		// then click our button so it all gets saved away
		$(".card-detail-title .edit .js-save-edit").click();

		return false
	}))
};


//for export
var $excel_btn,$excel_dl;
window.URL = window.webkitURL || window.URL;

function checkExport() {
	if($excel_btn && $excel_btn.filter(':visible').length) return;
	if($('.pop-over-list').find('.js-export-excel').length) return;
	var $js_btn = $('.pop-over-list').find('.js-export-json');
	var $ul = $js_btn.closest('ul:visible');
	if(!$js_btn.length) return;
	$js_btn.parent().after($('<li>').append(
		$excel_btn = $('<a href="#" target="_blank" title="Open downloaded file with Excel">Excel</a>')
			.click(showExcelExport)
		))
};

function showExcelExport() {
	$excel_btn.text('Generating...');

	$.getJSON($('.pop-over-list').find('.js-export-json').attr('href'), function(data) {
		var s = '<table id="export" border=1>';
		s += '<tr><th>Points</th><th>Story</th><th>Description</th></tr>';
		$.each(data['lists'], function(key, list) {
			var list_id = list["id"];
			s += '<tr><th colspan="3">' + list['name'] + '</th></tr>';

			$.each(data["cards"], function(key, card) {
				if (card["idList"] == list_id) {
					var title = card["name"];
					var parsed = title.match(reg);
					var points = parsed?parsed[1]:'';
					title = title.replace(reg,'');
					s += '<tr><td>'+ points + '</td><td>' + title + '</td><td>' + card["desc"] + '</td></tr>';
				}
			});
			s += '<tr><td colspan=3></td></tr>';
		});
		s += '</table>';

		var blob = new Blob([s],{type:'application/ms-excel'});

		var board_title_reg =  /.*\/(.*)$/;
		var board_title_parsed = document.location.href.match(board_title_reg);
		var board_title = board_title_parsed[1];

		$excel_btn
			.text('Excel')
			.after(
				$excel_dl=$('<a>')
					.attr({
						download: board_title + '.xls',
						href: window.URL.createObjectURL(blob)
					})
			);

		var evt = document.createEvent('MouseEvents');
		evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
		$excel_dl[0].dispatchEvent(evt);
		$excel_dl.remove()

	});

	return false
};
