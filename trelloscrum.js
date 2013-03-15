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
**
*/

//default story point picker sequence
var _pointSeq = ['?', 0, .5, 1, 2, 3, 5, 8, 13, 21];
//attributes representing points values for card
var _pointsAttr = ['cpoints', 'points'];


//internals
var filtered = false, //watch for filtered cards
	reg = /[\(](\x3f|\d*\.?\d+)([\)])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by ()
	regC = /[\[](\x3f|\d*\.?\d+)([\]])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by []
	iconUrl = chrome.extension.getURL('images/storypoints-icon.png'),
	pointsDoneUrl = chrome.extension.getURL('images/points-done.png');

function round(_val) {return (Math.floor(_val * 100) / 100)};

//what to do when DOM loads
$(function(){
	//watch filtering
	function updateFilters() {
		setTimeout(function(){
			filtered=$('.js-filter-cards').hasClass('is-on');
			calcListPoints()
		})		
	}
	$('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').live('mouseup', updateFilters);
	$('.js-input').live('keyup', updateFilters);

	//for storypoint picker
	$(".card-detail-title .edit-controls").live('DOMNodeInserted',showPointPicker);

	$('.js-share').live('mouseup',function(){
		setTimeout(checkExport,500)
	});

	calcListPoints();

});

document.body.addEventListener('DOMNodeInserted',function(e){
	if(e.target.id=='board') setTimeout(calcListPoints);
});

//calculate board totals
var ctto;
function computeTotal(){
	clearTimeout(ctto);
	ctto = setTimeout(function(){
		var $title = $('#board-header');
		var $total = $title.children('.list-total').empty();
		if ($total.length == 0)
			$total = $('<span class="list-total">').appendTo($title);

		for (var i in _pointsAttr){
			var score = 0,
				attr = _pointsAttr[i];
			$('#board .list-total .'+attr).each(function(){
				score+=parseFloat(this.textContent)||0;
			});
			$total.append('<span class="'+attr+'">'+(round(score)||'')+'</span>');
		}
	});
};

//calculate list totals
function calcListPoints($el){
	($el||$('.list')).each(function(){
		if(!this.list) new List(this);
		else if(this.list.calc) this.list.calc();
	})
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
		if($c.target) $c = $($c.target).filter('.list-card:not(.placeholder)');
		$c.each(function(){
			if(!this.listCard) for (var i in _pointsAttr)
				new ListCard(this,_pointsAttr[i]);
			else for (var i in _pointsAttr)
				setTimeout(this.listCard[_pointsAttr[i]].refresh);
		});
	};

	this.calc = function(e){
		if(e&&e.target&&!$(e.target).hasClass('list-card')) return;
		clearTimeout(to);
		to = setTimeout(function(){
			$total.empty().appendTo($list.find('.list-title'));
			for (var i in _pointsAttr){
				var score=0,
					attr = _pointsAttr[i];
				$list.find('.list-card:not(.placeholder)').each(function(){
					if(!this.listCard) return;
					if(!isNaN(Number(this.listCard[attr].points)))score+=Number(this.listCard[attr].points)
				});
				var scoreTruncated = round(score);
				$total.append('<span class="'+attr+'">'+(scoreTruncated>0?scoreTruncated:'')+'</span>');
				computeTotal();
			}
		});
	};

	$list.on('DOMNodeRemoved',this.calc).on('DOMNodeInserted',readCard);

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
		to,
		phref='',
		$card=$(el),
		$badge=$('<div class="badge badge-points point-count" style="background-image: url('+iconUrl+')"/>');

	this.refresh=function(){
		setTimeout(function(){
			var $title=$card.find('a.list-card-title');
			if(!$title[0])return;
			var title=$title[0].text;
			var href = $title.attr('href');
			if(title) el._title = title;
			if(href!=phref) {
				phref = href;
				parsed=title.match(regexp);
				points=parsed?parsed[1]:-1;
			}
			setTimeout(function(){
				$title[0].textContent = el._title = el._title.replace(regexp,'');
				$badge
					.text(that.points)
					[(consumed?'add':'remove')+'Class']('consumed')
					.attr({title: 'This card has '+that.points+ (consumed?' consumed':'')+' storypoint' + (that.points == 1 ? '.' : 's.')})
					.prependTo($card.find('.badges'));
				var list = $card.closest('.list');
				if(list[0]) list[0].list.calc();
			})
		});
	};

	this.__defineGetter__('points',function(){
		//don't add to total when filtered out
		return parsed&&(!filtered||($card.css('opacity')==1 && $card.css('display')!='none'))?points:''
	});

	setTimeout(that.refresh);
};

//the story point picker
function showPointPicker() {
	if($(this).find('.picker').length) return;
	var $picker = $('<div class="picker">').appendTo('.card-detail-title .edit-controls');
	for (var i in _pointSeq) $picker.append($('<span class="point-value">').text(_pointSeq[i]).click(function(){
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

		var board_title_reg = /.*\/board\/(.*)\//;
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

