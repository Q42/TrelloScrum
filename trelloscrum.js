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

//default story point picker sequence (can be overridden in the Scrum for Trello 'Settings' popup)
var _pointSeq = ['?', 0, .5, 1, 2, 3, 5, 8, 13, 21];
//attributes representing points values for card
var _pointsAttr = ['cpoints', 'points'];

// All settings and their defaults.
var S4T_SETTINGS = [];
var SETTING_NAME_LINK_STYLE = "burndownLinkStyle";
var SETTING_NAME_ESTIMATES = "estimatesSequence";
var S4T_ALL_SETTINGS = [SETTING_NAME_LINK_STYLE, SETTING_NAME_ESTIMATES];
var S4T_SETTING_DEFAULTS = {};
S4T_SETTING_DEFAULTS[SETTING_NAME_LINK_STYLE] = 'full';
S4T_SETTING_DEFAULTS[SETTING_NAME_ESTIMATES] = _pointSeq.join();

//internals
var reg = /((?:^|\s?))\((\x3f|\d*\.?\d+)(\))\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by ()
    regC = /((?:^|\s?))\[(\x3f|\d*\.?\d+)(\])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by []
    iconUrl, pointsDoneUrl,
	flameUrl, flame18Url,
	scrumLogoUrl, scrumLogo18Url;
// FIREFOX_BEGIN_REMOVE
if(typeof chrome !== 'undefined'){
    // Works in Chrome & FF 57.
    // FIREFOX_END_REMOVE
	iconUrl = chrome.extension.getURL('images/storypoints-icon.png');
	pointsDoneUrl = chrome.extension.getURL('images/points-done.png');
    flameUrl = chrome.extension.getURL('images/burndown_for_trello_icon_12x12.png');
    flame18Url = chrome.extension.getURL('images/burndown_for_trello_icon_18x18.png');
	scrumLogoUrl = chrome.extension.getURL('images/trello-scrum-icon_12x12.png');
	scrumLogo18Url = chrome.extension.getURL('images/trello-scrum-icon_18x18.png');
	// FIREFOX_BEGIN_REMOVE - This is for firefox review requirements. We can't have code that doesn't run in FF.
} else if(navigator.userAgent.indexOf('Safari') != -1){ // Chrome defines both "Chrome" and "Safari", so this test MUST be done after testing for Chrome
	// Works in Safari
	iconUrl = safari.extension.baseURI + 'images/storypoints-icon.png';
	pointsDoneUrl = safari.extension.baseURI + 'images/points-done.png';
    flameUrl = safari.extension.baseURI + 'images/burndown_for_trello_icon_12x12.png';
    flame18Url = safari.extension.baseURI + 'images/burndown_for_trello_icon_18x18.png';
	scrumLogoUrl = safari.extension.baseURI + 'images/trello-scrum-icon_12x12.png';
	scrumLogo18Url = safari.extension.baseURI + 'images/trello-scrum-icon_18x18.png';
} // FIREFOX_END_REMOVE

refreshSettings(); // get the settings right away (may take a little bit if using Chrome cloud storage)

function round(_val) {return (Math.round(_val * 100) / 100)};

// Comment out before release - makes cross-browser debugging easier.
//function log(msg){
//	if(typeof chrome !== 'undefined'){
//		console.log(msg);
//	} else {
//		$($('.header-btn-text').get(0)).text(msg);
//	}
//}

// Some browsers have serious errors with MutationObserver (eg: Safari doesn't have it called MutationObserver).
var CrossBrowser = {
	init: function(){
		this.MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver || null;
	}
};
CrossBrowser.init();



//what to do when DOM loads
$(function(){
	//watch filtering
	function updateFilters() {
		setTimeout(calcListPoints);
	};
	$('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').off('mouseup');
	$('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').on('mouseup', calcListPoints);
	$('.js-input').off('keyup');
	$('.js-input').on('keyup', calcListPoints);
	$('.js-share').off('mouseup');
	$('.js-share').on('mouseup',function(){
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

var recalcTotalsObserver = new CrossBrowser.MutationObserver(function(mutations)
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
			  || $target.hasClass('list-header')
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
    
	// There appears to be a change to have the card-title always be a textarea. We'll allow for either way, to
	// start (in case this is A/B testing, or they don't keep it). 20160409
    $editControls = $(".card-detail-title .edit-controls"); // old selector
	if($editControls.length == 0){
		$editControls = $(".js-card-detail-title-input.is-editing").closest('.window-header'); // new selector
	}
    if($editControls.length > 0)
    {
        showPointPicker($editControls.get(0));
    }
});
recalcTotalsObserver.observe(document.body, obsConfig);

// Refreshes the link to the Burndown Chart dialog.
function updateBurndownLink(){
    // Add the link for Burndown Charts
    //$('.s4tLink').remove();
    if($('.s4tLink').length === 0){
		var buttons = "";

		// Link for Burndown Charts
		var linkSetting = S4T_SETTINGS[SETTING_NAME_LINK_STYLE];
		if(linkSetting !== 'none'){
			buttons += "<a id='burndownLink' class='s4tLink quiet ed board-header-btn dark-hover' href='#'>";
			buttons += "<span class='icon-sm board-header-btn-icon'><img src='"+flameUrl+"' width='12' height='12'/></span>";
			if(linkSetting !== 'icon'){
				buttons += "<span class='text board-header-btn-text'>Burndown Chart</span>";
			}
			buttons += "</a>";
		}
		// Link for settings
		buttons += "<a id='scrumSettingsLink' class='s4tLink quiet ed board-header-btn dark-hover' href='#'>";
		buttons += "<span class='icon-sm board-header-btn-icon'><img src='"+scrumLogoUrl+"' width='12' height='12' title='Settings: Scrum for Trello'/></span>";
		//buttons += "<span class='text board-header-btn-text'>Settings</span>"; // too big :-/ icon only for now
		buttons += "</a>";
		var showOnLeft = true;
		if(showOnLeft){
			$('.board-header-btns.mod-left').last().after(buttons);
		} else {
			$('.board-header-btns.mod-right,#board-header a').last().after(buttons);
		}
        $('#burndownLink').click(showBurndown);
		$('#scrumSettingsLink').click(showSettings);
    }
}

var ignoreClicks = function(){ return false; };
function showBurndown()
{
    $('body').addClass("window-up");
    $('.window').css("display", "block").css("top", "50px");

	// Figure out the current user and board.
	$memberObj = $('.js-open-header-member-menu>div');
	var username = $memberObj.attr('title').match(/\(([^\)\(]*?)\)$/)[1];

	// Find the short-link board name, etc. so that the back-end can figure out what board this is.
	var shortLink = document.location.href.match(/b\/([A-Za-z0-9]{8})\//)[1];
	var boardName = "";
	boardName = $('.board-name span.text').text().trim();

	// Build the dialog DOM elements. There are no unescaped user-provided strings being used here.
	var clearfix = $('<div/>', {class: 'clearfix'});
	var windowHeaderUtils = $('<div/>', {class: 'window-header-utils dialog-close-button'}).append( $('<a/>', {class: 'icon-lg icon-close dark-hover js-close-window', href: '#', title:'Close this dialog window.'}) );
	var iFrameWrapper = $('<div/>', {style: 'padding:10px; padding-top: 13px;'});
    var flameIcon = $('<img/>', {style: 'position:absolute; margin-left: 20px; margin-top:15px;', src:flame18Url});
    
	var actualIFrame = $('<iframe/>', {frameborder: '0',
						 style: 'width: 691px; height: 820px;',
						 id: 'burndownFrame',
						 src: "https://www.burndownfortrello.com/s4t_burndownPopup.php?username="+encodeURIComponent(username)+"&shortLink="+encodeURIComponent(shortLink)+"&boardName="+encodeURIComponent(boardName)
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
    //$(window).bind('resize', repositionBurndown);
    $('.window-overlay').bind('click', hideBurndown);
    
    //repositionBurndown();
}

var settingsFrameId = 'settingsFrame';
function showSettings()
{
    $('body').addClass("window-up");
    $('.window').css("display", "block").css("top", "50px");

	// Build the dialog DOM elements. There are no unescaped user-provided strings being used here.
	var clearfix = $('<div/>', {class: 'clearfix'});
	var windowHeaderUtils = $('<div/>', {class: 'window-header-utils dialog-close-button'}).append( $('<a/>', {class: 'icon-lg icon-close dark-hover js-close-window', href: '#', title:'Close this dialog window.'}) );
    var settingsIcon = $('<img/>', {style: 'position:absolute; margin-left: 20px; margin-top:15px;', src:scrumLogo18Url});

	// Create the Settings form.
	{
		// Load the current settings (with defaults in case Settings haven't been set).
		var setting_link = S4T_SETTINGS[SETTING_NAME_LINK_STYLE];
		var setting_estimateSeq = S4T_SETTINGS[SETTING_NAME_ESTIMATES];
	
		var settingsDiv = $('<div/>', {style: "padding:0px 10px;font-family:'Helvetica Neue', Arial, Helvetica, sans-serif;"});
		var iframeHeader = $('<h3/>', {style: 'text-align: center;'});
		iframeHeader.text('Scrum for Trello');
		var settingsHeader = $('<h3/>', {style: 'text-align: center;margin-bottom:0px'});
		settingsHeader.text('Settings');
		var settingsInstructions = $('<div/>', {style: 'margin-bottom:10px'}).html('These settings affect how Scrum for Trello appears to <em>you</em> on all boards.  When you&apos;re done, remember to click "Save Settings" below.');
		var settingsForm = $('<form/>', {id: 'scrumForTrelloForm'});
		
		// How the 'Burndown Chart' link should appear (if at all).
		var fieldset_burndownLink = $('<fieldset/>');
		var legend_burndownLink = $('<legend/>');
		legend_burndownLink.text("Burndown Chart link");
		var burndownLinkSetting_radioName = 'burndownLinkSetting';
		fieldset_burndownLink.append(legend_burndownLink);
			var burndownRadio_full = $('<input/>', {type: 'radio', name: burndownLinkSetting_radioName, id: 'link_full', value: 'full'});
			if(setting_link == 'full'){
				burndownRadio_full.prop('checked', true);
			}
			var label_full = $('<label/>', {for: 'link_full'});
			label_full.text('Enable "Burndown Chart" link (recommended)');
			fieldset_burndownLink.append(burndownRadio_full).append(label_full).append("<br/>");

			var burndownRadio_icon = $('<input/>', {type: 'radio', name: burndownLinkSetting_radioName, id: 'link_icon', value: 'icon'});
			if(setting_link == 'icon'){
				burndownRadio_icon.prop('checked', true);
			}
			var label_icon = $('<label/>', {for: 'link_icon'});
			label_icon.text('Icon only');
			fieldset_burndownLink.append(burndownRadio_icon).append(label_icon).append("<br/>");

			var burndownRadio_none = $('<input/>', {type: 'radio', name: burndownLinkSetting_radioName, id: 'link_none', value: 'none'});
			if(setting_link == 'none'){
				burndownRadio_none.prop('checked', true);
			}
			var label_none = $('<label/>', {for: 'link_none'});
			label_none.text('Disable completely');
			fieldset_burndownLink.append(burndownRadio_none).append(label_none).append("<br/>");
		
		// Which estimate buttons should show up.
		var fieldset_estimateButtons = $('<fieldset/>', {style: 'margin-top:5px'});
		var legend_estimateButtons = $('<legend/>');
		legend_estimateButtons.text("Estimate Buttons");
		fieldset_estimateButtons.append(legend_estimateButtons);
			var explanation = $('<div/>').text("List out the values you want to appear on the estimate buttons, separated by commas. They can be whole numbers, decimals, or a question mark.");
			fieldset_estimateButtons.append(explanation);
			
			var estimateFieldId = 'pointSequenceToUse';
			var estimateField = $('<input/>', {id: estimateFieldId, size: 40, val: setting_estimateSeq});
			fieldset_estimateButtons.append(estimateField);
			
			var titleTextStr = "Original sequence is: " + _pointSeq.join();
			var restoreDefaultsButton = $('<button/>')
											.text('restore to original values')
											.attr('title', titleTextStr)
											.click(function(e){
												e.preventDefault();
												$('#'+settingsFrameId).contents().find('#'+estimateFieldId).val(_pointSeq.join());
											});
			fieldset_estimateButtons.append(restoreDefaultsButton);

		var saveButton = $('<button/>', {style:'margin-top:5px'}).text('Save Settings').click(function(e){
			e.preventDefault();

			// Save the settings (persists them using Chrome cloud, LocalStorage, or Cookies - in that order of preference if available).
			S4T_SETTINGS[SETTING_NAME_LINK_STYLE] = $('#'+settingsFrameId).contents().find('input:radio[name='+burndownLinkSetting_radioName+']:checked').val();
			S4T_SETTINGS[SETTING_NAME_ESTIMATES] = $('#'+settingsFrameId).contents().find('#'+estimateFieldId).val();

			// Persist all settings.
			$.each(S4T_ALL_SETTINGS, function(i, settingName){
				saveSetting(settingName, S4T_SETTINGS[settingName]);
			});

			// Allow the UI to update itself as needed.
			onSettingsUpdated();
		});
		var savedIndicator = $('<span/>', {id: 's4tSaved', style: 'color:#080;background-color:#afa;font-weight:bold;display:none;margin-left:10px'})
									.text("Saved!");

		// Set up the form (all added down here to be easier to change the order).
		settingsForm.append(fieldset_burndownLink);
		settingsForm.append(fieldset_estimateButtons);
		settingsForm.append(saveButton);
		settingsForm.append(savedIndicator);
	}
	
	// Quick start instructions.
	var quickStartDiv = $('<div>\
		<h4 style="margin-top:0px;margin-bottom:0px">Getting started</h4>\
		<ol style="margin-top:0px">\
			<li>To add an estimate to a card, first <strong>click a card</strong> to open it</li>\
			<li><strong>Click the title of the card</strong> to "edit" the title.</li>\
			<li>Once the Card title is in edit-mode, blue number buttons will appear. <strong>Click one of the buttons</strong> to set that as the estimate.</li>\
		</ol>\
	</div>');

	var moreInfoLink = $('<small>For more information, see <a href="http://scrumfortrello.com">ScrumForTrello.com</a></small>');

	// Add each of the components to build the iframe (all done here to make it easier to re-order them).
	settingsDiv.append(iframeHeader);
	settingsDiv.append(quickStartDiv);
	settingsDiv.append(settingsHeader);
	settingsDiv.append(settingsInstructions);
	settingsDiv.append(settingsForm);
	settingsDiv.append(moreInfoLink);

	// Trello swallows normal input, so things like checkboxes and radio buttons don't work right... so we stuff everything in an iframe.
	var iframeObj = $('<iframe/>', {frameborder: '0',
						 style: 'width: 670px; height: 528px;', /* 512 was fine on Chrome, but FF requires 528 to avoid scrollbars */
						 id: settingsFrameId,
	});
	$windowWrapper = $('.window-wrapper');
    $windowWrapper.click(ignoreClicks);
	$windowWrapper.empty().append(clearfix).append(settingsIcon).append(windowHeaderUtils);

	iframeObj.appendTo($windowWrapper);

	// Firefox wil load the iframe (even if there is no 'src') and overwrite the existing HTML, so we've
	// reworked this to load about:blank then set our HTML upon load completion.
	iframeObj.load(function(){
		iframeObj.contents().find('body').append(settingsDiv);
	});
	iframeObj.attr('src', "about:blank"); // need to set this AFTER the .load() has been registered.
	
	$('.window-header-utils a.js-close-window').click(hideBurndown);
    //$(window).bind('resize', repositionBurndown);
    $('.window-overlay').bind('click', hideBurndown);

	//repositionBurndown();
}

function hideBurndown()
{
    $('body').removeClass("window-up");
    $('.window').css("display", "none");
    //$(window).unbind('resize', repositionBurndown);
	$('.window-header-utils a.js-close-window').unbind('click', hideBurndown);
	$('.window-wrapper').unbind('click', ignoreClicks);
    $('.window-overlay').unbind('click', hideBurndown);
}

// NOTE: With the most recent Trello update, I don't think we have to position the window manually anymore.
// If that changes, restore the function AND uncomment the calls to it.
//function repositionBurndown()
//{
    //windowWidth = $(window).width();
    //if(windowWidth < 0) // todo change this to a n actual number (probably 710 or so)
    //{
    //    // todo shrink our iframe to an appropriate size.  contents should wrap
    //}
    //else
    //{
    //    burndownWindowWidth = 690;
    //    leftPadding = (windowWidth - burndownWindowWidth) / 2.0;
    //    $('.window').css("left", leftPadding);
    //}
//}

//calculate board totals
var ctto;
function computeTotal(){
	clearTimeout(ctto);
	ctto = setTimeout(function(){
		var $title = $('.board-header-btns.mod-right,#board-header a');
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
		to;

	function readCard($c){
		if($c.target) {
			if(!/list-card/.test($c.target.className)) return;
			$c = $($c.target).filter('.list-card:not(.placeholder)');
		}
		$c.each(function(){
			if(!this.listCard) for (var i in _pointsAttr){
				new ListCard(this,_pointsAttr[i]);
			} else {
				for (var i in _pointsAttr){
					setTimeout(this.listCard[_pointsAttr[i]].refresh);
				}
			}
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
			$total.empty().appendTo($list.find('.list-title,.list-header'));
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

	var cardAddedRemovedObserver = new CrossBrowser.MutationObserver(function(mutations)
	{
		// Determine if the mutation event included an ACTUAL change to the list rather than
		// a modification caused by this extension making an update to points, etc. (prevents
		// infinite recursion).
		$.each(mutations, function(index, mutation){
			var $target = $(mutation.target);
			
			// Ignore a bunch of known elements that send mutation events.
			if(! ($target.hasClass('list-total')
					|| $target.hasClass('list-title')
					|| $target.hasClass('list-header')
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
			var $title=$card.find('.js-card-name');
			if(!$title[0])return;
			// This expression gets the right value whether Trello has the card-number span in the DOM or not (they recently removed it and added it back).
			var titleTextContent = (($title[0].childNodes.length > 1) ? $title[0].childNodes[$title[0].childNodes.length-1].textContent : $title[0].textContent);
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
				if($title[0].childNodes.length > 1){
					$title[0].childNodes[$title[0].childNodes.length-1].textContent = parsedTitle; // if they keep the card numbers in the DOM
				} else {
					$title[0].textContent = parsedTitle; // if they yank the card numbers out of the DOM again.
				}
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

	var cardShortIdObserver = new CrossBrowser.MutationObserver(function(mutations){
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
	
	// Try to allow this to work with old card style (with save button) or new style (where title is always a textarea).
	var $elementToAddPickerTo = $('.card-detail-title .edit-controls');
	if($elementToAddPickerTo.length == 0){
		$elementToAddPickerTo = $(".js-card-detail-title-input").closest('.window-header');
	}

	var $picker = $('<div/>', {class: "picker"}).appendTo($elementToAddPickerTo.get(0));
	$picker.append($('<span>', {class: "picker-title"}).text("Estimated Points"));
	
	var estimateSequence = (S4T_SETTINGS[SETTING_NAME_ESTIMATES].replace(/ /g, '')).split(',');
	for (var i in estimateSequence) $picker.append($('<span>', {class: "point-value"}).text(estimateSequence[i]).click(function(){
		var value = $(this).text();
		var $text = $('.card-detail-title .edit textarea'); // old text-areas
		if($text.length == 0){
			$text = $('textarea.js-card-detail-title-input'); // new text-area
		}
		var text = $text.val();

		// replace estimates in card title
		$text[0].value=text.match(reg)?text.replace(reg, '('+value+') '):'('+value+') ' + text;

		// in old-textarea method, click our button so it all gets saved away
		$(".card-detail-title .edit .js-save-edit").click();
		// in new-textarea method, have to do a few actions to get it to save after we click away from the card
		$('textarea.js-card-detail-title-input').click();
		$('textarea.js-card-detail-title-input').focus();

		return false;
	}));
	
	if($(location).find('.picker-consumed').length) return;
	var $pickerConsumed = $('<div/>', {class: "picker-consumed"}).appendTo($elementToAddPickerTo.get(0));
	$pickerConsumed.append($('<span>', {class: "picker-title"}).text("Consumed Points"));

	var consumedSequence = (S4T_SETTINGS[SETTING_NAME_ESTIMATES]).split(',');
	for (var i in consumedSequence) $pickerConsumed.append($('<span>', {class: "point-value"}).text(consumedSequence[i]).click(function(){
		var value = $(this).text();
		var $text = $('.card-detail-title .edit textarea'); // old text-areas
		if($text.length == 0){
			$text = $('textarea.js-card-detail-title-input'); // new text-area
		}
		var text = $text.val();

		// replace consumed value in card title
		$text[0].value=text.match(regC)?text.replace(regC, ' ['+value+']'):text + ' ['+value+']';

		// in old-textarea method, click our button so it all gets saved away
		$(".card-detail-title .edit .js-save-edit").click();
		// in new-textarea method, have to do a few actions to get it to save after we click away from the card
		$('textarea.js-card-detail-title-input').click();
		$('textarea.js-card-detail-title-input').focus();

		return false;
	}));
};


//for export
var $excel_btn,$excel_dl;
window.URL = window.URL || window.webkitURL;

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

// for settings

function useChromeStorage(){
	return ((typeof chrome !== "undefined") && (typeof chrome.storage !== "undefined"));
}

/**
 * Saves the Setting (defined by 'settingName') to be whatever is in 'settingValue'.
 *
 * This will use Chrome cloud-storage if available, then will fall back to LocalStorage
 * if possible and fall back to cookies otherwise.
 *
 * NOTE: Remember to enver store confidential or user information in Chrome cloud
 * storage (it's not encrypted).
 */
function saveSetting(settingName, settingValue){
	// Use Chrome cloud storage where available (will sync across multiple computers).
	if(useChromeStorage()){
		var objectToPersist = {}; // can't use an object-literal to do it, or chrome will make an object whose key is literally 'settingName'
		objectToPersist[settingName] = settingValue;
		chrome.storage.sync.set(objectToPersist, function() {
			// console.log("Chrome saved " + settingName + ".");
		});
	} else if(typeof(Storage) !== "undefined"){
		localStorage[settingName] = settingValue;
	} else {
		// No LocalStorage support... use cookies instead.
		setCookie(settingName, settingValue);
	}
} // end saveSetting()

/**
 * Retrieves the Setting defined by 'settingName'. The 'defaultValue' is optional.
 *
 * This will use LocalStorage if possible and fall back to cookies otherwise. Typically
 * this function will only be used if Chrome cloud storage is not available.
 */
function getSetting(settingName, defaultValue){
	var retVal = defaultValue;
	if(typeof(Storage) !== "undefined"){
		var lsValue = localStorage[settingName];
		if(typeof lsValue !== 'undefined'){
			retVal = lsValue;
		}
	} else {
		// No LocalStorage support... use cookies instead.
		retVal = getCookie(settingName, defaultValue);
	}
	return retVal;
}; // end getSetting()

/**
 * Refreshes all of the persisted settings and puts them in memory. This is
 * done at the beginning, and any time chrome cloud-storage sends an event
 * that the data has changed.
 */
function refreshSettings(){
	if(useChromeStorage()){
		chrome.storage.sync.get(S4T_ALL_SETTINGS, function(result){
			//if(chrome.runtime.lastError){}
			$.each(S4T_ALL_SETTINGS, function(i, settingName){
				if(result[settingName]){
					S4T_SETTINGS[settingName] = result[settingName];
				} else {
					S4T_SETTINGS[settingName] = S4T_SETTING_DEFAULTS[settingName];
				}
			});
			onSettingsUpdated();
		});
	} else {
		// Get the settings (with defaults for each). Add a new line here for every new setting.
		$.each(S4T_ALL_SETTINGS, function(i, settingName){
			S4T_SETTINGS[settingName] = getSetting(settingName, S4T_SETTING_DEFAULTS[settingName]);
		});
		onSettingsUpdated();
	}
}; // end refreshSettings()

function onSettingsUpdated(){
	// Temporary indication to the user that the settings were saved (might not always be on screen, but that's not a problem).
	$('#'+settingsFrameId).contents().find('#s4tSaved').show().fadeOut(2000, "linear");
	
	// Refresh the links because link-settings may have changed.
	$('.s4tLink').remove();
	updateBurndownLink();
} // end onSettingsUpdated()

/**
 * Sets a key/value cookie to live for about a year. Cookies are typically not used by
 * this extension if LocalSettings is available in the browser.
 * From: http://www.w3schools.com/js/js_cookies.asp
 */
function setCookie(c_name,value){
	var exdays = 364;
	var exdate=new Date();
	exdate.setDate(exdate.getDate() + exdays);
	var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
	document.cookie=c_name + "=" + c_value;
}; // end setCookie()

/**
 * Gets a cookie value if available (defaultValue if not found). Cookies are typically not\
 * used by this extension if LocalSettings is available in the browser.
 * Basically from: http://www.w3schools.com/js/js_cookies.asp
 */
function getCookie(c_name, defaultValue){
	var c_value = document.cookie;
	var c_start = c_value.indexOf(" " + c_name + "=");
	if (c_start == -1){
		c_start = c_value.indexOf(c_name + "=");
	}
	if (c_start == -1){
		c_value = defaultValue;
	} else {
		c_start = c_value.indexOf("=", c_start) + 1;
		var c_end = c_value.indexOf(";", c_start);
		if (c_end == -1) {
			c_end = c_value.length;
		}
		c_value = unescape(c_value.substring(c_start,c_end));
	}
	return c_value;
}; // end getCookie()
