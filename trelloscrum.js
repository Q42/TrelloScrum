/*
** TrelloScrum v0.3 - https://github.com/Q42/TrelloScrum
** Adds Scrum to your Trello
**
** Orig:
** Jasper Kaizer <https://github.com/jkaizer>
** Marcel Duin <https://github.com/marcelduin>
**
** Contribs:
** Paul Lofte <https://github.com/paullofte>
** Nic Pottier <https://github.com/nicpottier>
**
** Changelog:
**
** v0.3
** - Now event-driven, much faster response
** - Added help page to trello manual
** - Includes story point picker
** - JS rewrite
** - Small bugfixes
**
** v0.2
** - Includes decimal story points
** - Filtered cards aren't added to list totals
** - Question mark accepted as story points
** - Fancier storypoint display
**
** v0.1
** - Initial release
**
*/

//watch for filtered cards
var filtered=false;

//parse regexp- accepts digits, decimals and '?'
var reg=/\((\x3f|\d*\.?\d+)\)\s?/m;

var iconUrl = chrome.extension.getURL("storypoints-icon.png");

$(function(){
	//watch filtering
	$('.js-filter-cards').live('DOMSubtreeModified',function(){
		filtered=$('.js-filter-cards').hasClass('is-on');
		calcPoints()
	});

	//for storypoint picker
	$(".card-detail-title .edit-controls").live('DOMNodeInserted',showPointPicker);

	//about-screen
	$('.manual').live('DOMNodeInserted',function(){
		var $manual = $(this);
		var $sidebar = $manual.children('.window-sidebar');
		if($sidebar.find('.ts-about').length)return;
		var $part = $('<div class="sidebar-nav mini window-module ts-about">').appendTo($sidebar);
		$('<h3>Trello Scrum</h3>').appendTo($part);
		var $ul = $('<ul>').appendTo($part);
		var $abt = $('<a href="#">').text('Help').appendTo($('<li>').appendTo($ul));
		$abt.click(function(){
			$.get(chrome.extension.getURL("help.html"), function(d){
				$sidebar.find('.active').removeClass('active');
				$abt.addClass('active');
				$manual.children('.window-header').children('.window-title').text($(d.getElementsByTagName('title')).text());
				$manual.children('.window-main-col').empty().append($(d.getElementsByTagName('body')).children())
			})
		})
	});

	//want: trello events
	(function periodical(){
		$('.list').each(list);
		$('.list-card').each(listCard);
		setTimeout(periodical,1000)
	})()
});

//.list pseudo
function list(e){
	if(this.list)return;
	this.list=true;

	var $list=$(this);
	var $total=$('<span class="list-total">')
		.appendTo($list.find('.list-header h2'));

	$total.bind('DOMNodeRemovedFromDocument',function(){
		setTimeout(function(){
			$total.appendTo($list.find('.list-header h2'))
		})
	});

	this.calc = function(){
		var score=0;
		$list.find('.list-card').each(function(){if(!isNaN(Number(this.points)))score+=Number(this.points)});
		$total.text(score>0?score:'')
	}
};

//.list-card pseudo
function listCard(e){
	if(this.listCard)return;
	this.listCard=true;

	var points=-1,
		parsed,
		that=this,
		$card=$(this),
		$badge=$('<span class="badge badge-points point-count" style="background-image: url('+iconUrl+') !important;">');

	if($card.hasClass('placeholder'))return;

	$card.bind('DOMNodeInserted',function(e){
		if(e.target==that&&$card.closest('.list')[0])getPoints()
	});

	function getPoints(){
		var $title=$card.find('.list-card-title a');
		if(!$title[0])return;
		var title=$title.text();
		parsed=($title[0].otitle||title).match(reg);
		points=parsed?parsed[1]:title;
		if(points!=title)$title[0].otitle=title;
		$title.text($title.text().replace(reg,''));
		if($card.parent()[0]){
			$badge.text(that.points).prependTo($card.find('.badges'));
			$badge.attr({title: "This card has "+that.points+" storypoint(s)."})
		}
		calcPoints()
	};

	this.__defineGetter__('points',function(){
		//don't add to total when filtered out
		return parsed&&(!filtered||$card.css('opacity')==1)?points:''
	});

	getPoints()
};

//forcibly calculate list totals
function calcPoints(){
	$('.list').each(function(){if(this.calc)this.calc()})
};

//default story point picker sequence
var _pointSeq = [0, 1, 2, 3, 5, 8, 13, 20];

function showPointPicker() {
	if($(this).find('.picker').length)return;

	var pickers = '<span class="point-value">?</span> ';
	for (var i=0; i < _pointSeq.length; i++)
		pickers += '<span class="point-value">' + _pointSeq[i] + '</span> ';

	var picker = "<div class='picker'>" + pickers + "</div>";
	$(".card-detail-title .edit-controls").append(picker);
	$(".point-value").click(updatePoint);
};

function updatePoint(){
	var value = $(this).text();
	var text = $(".card-detail-title .edit textarea").val();
	$(".card-detail-title .edit textarea").remove();

	// replace our new
	text = text.match(reg)?text.replace(reg, '('+value+')'):'('+value+') ' + text;

	// total hackery to get Trello to acknowledge our new value
	$(".card-detail-title .edit").prepend('<textarea type="text" class="field single-line" style="height: 42px; ">' + text + '</textarea>');

	// then click our button so it all gets saved away
	$(".card-detail-title .edit .js-save-edit").click();
	calcPoints();
};
