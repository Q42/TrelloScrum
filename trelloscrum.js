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
**
*/

//default story point picker sequence
var _pointSeq = ['?', 0, 1, 2, 3, 5, 8, 13, 20];
//attributes representing points values for card
var _pointsAttr = ['cpoints', 'points'];


//internals
var filtered = false, //watch for filtered cards
	reg = /[\(](\x3f|\d*\.?\d+)([\)])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by ()
	regC = /[\[](\x3f|\d*\.?\d+)([\]])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by []
	iconUrl = chrome.extension.getURL('images/storypoints-icon.png'),
	pointsDoneUrl = chrome.extension.getURL('images/points-done.png');

var Utils = (function(){
	function _roundValue(_val){
		return (Math.floor(_val * 100) / 100);
	}
	return {
		roundValue : _roundValue
	}
})();

//what to do when DOM loads
$(function(){
	//watch filtering
	function updateFilters() {
		setTimeout(function(){
			filtered=$('.js-filter-cards').hasClass('is-on');
			calcPoints()
		})		
	}
	$('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').live('mouseup', updateFilters);
	$('.js-input').live('keyup', updateFilters);
	

	//for storypoint picker
	$(".card-detail-title .edit-controls").live('DOMNodeInserted',showPointPicker);

	$('body').bind('DOMSubtreeModified DOMNodeInserted',function(e){
		if($(e.target).hasClass('list')){
			readList($(e.target));
			computeTotal();
		}
	});


	$('.js-share').live('mouseup',function(){
		setTimeout(checkExport)
	});
	
	function computeTotal(){
		var $title = $("#board-header");
		var $total = $("#board-header .list-total");
		if ($total.length == 0){
			$total = $("<span class='list-total'>").appendTo($title);
		}
		for (var i in _pointsAttr){
			var score = 0;
			var attr = _pointsAttr[i];
			$("#board .list-total ."+attr).each(function(){ 
				var value = $(this).text();
				if (value && !isNaN(value)){
					score+=parseFloat(value);
				} 
			});
			var $countElem = $('#board-header .list-total .'+attr);
			if ($countElem.length > 0){
				$countElem.remove();
			}
			$total.append("<span class='"+attr+"'>"+Utils.roundValue(score)+"</span>");
		}
	}

	function readList($c){

		$c.each(function(){
			if(!this.list) new List(this);
			else if(this.list.calc) this.list.calc();
		})
	}


	readList($('.list'));

});

//.list pseudo
function List(el){
	if(el.list)return;
	el.list=this;

	var $list=$(el),
		busy = false,
		to,
		to2;

	var $total=$('<span class="list-total">')
		.bind('DOMNodeRemovedFromDocument',function(){
			clearTimeout(to);
			to=setTimeout(function(){
				$total.appendTo($list.find('.list-header h2'))
			})
		})
		.appendTo($list.find('.list-header h2'));

	$list.bind('DOMNodeInserted',function(e){
		if($(e.target).hasClass('list-card') && !e.target.listCard) {
			clearTimeout(to2);
			to2=setTimeout(readCard,0,$(e.target))
		}
	});

	function readCard($c){
		$c.each(function(){
			var that=this,
					 to2,
					 busy=false;
			if($(that).hasClass('placeholder')) return;
			if(!that.listCard){
				for (var i in _pointsAttr){
					new ListCard(that, _pointsAttr[i])
				}
				$(that).bind('DOMNodeInserted',function(e){
					if(!busy && ($(e.target).hasClass('list-card-title') || e.target==that)) {
						clearTimeout(to2);
						to2=setTimeout(function(){
							busy=true;
							for (var i in that.listCard){
								that.listCard[i].refresh();
							}
							busy=false;
						});
					}
				});
			} 
		})
	};

	this.calc = function(){
		$total.empty();
		for (var i in _pointsAttr){
			var score=0;
			var attr = _pointsAttr[i];
			$list.find('.list-card').each(function(){if(this.listCard && !isNaN(Number(this.listCard[attr].points)))score+=Number(this.listCard[attr].points)});
			var scoreTruncated = Utils.roundValue(score);			
			$total.append('<span class="'+attr+'">'+(scoreTruncated>0?scoreTruncated:'')+'</span>');
		}
	};

	readCard($list.find('.list-card'));
	this.calc();
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
		ptitle,
		$card=$(el),
		$badge=$('<div class="badge badge-points point-count" style="background-image: url('+iconUrl+')"/>')
			.bind('DOMSubtreeModified DOMNodeRemovedFromDocument',function(e){
				if(busy)return;
				busy=true;
				clearTimeout(to);
				to = setTimeout(function(){
					$badge.prependTo($card.find('.badges'));
					busy=false;
				});
			});

	this.refresh=function(){
		var $title=$card.find('a.list-card-title');
		if(!$title[0])return;
		var title=$title[0].text;
		parsed=title.match(regexp);
		points=parsed?parsed[1]:-1;
		if($card.parent()[0]){
			$title[0].textContent = title.replace(regexp,'');
			$badge.text(that.points);
			consumed?$badge.addClass("consumed"):$badge.removeClass('consumed');
			$badge.attr({title: 'This card has '+that.points+ (consumed?' consumed':'')+' storypoint' + (that.points == 1 ? '.' : 's.')})
		}
	};

	this.__defineGetter__('points',function(){
		//don't add to total when filtered out
		return parsed&&(!filtered||($card.css('opacity')==1 && $card.css('display')!='none'))?points:''
	});

	this.refresh();
};

//forcibly calculate list totals
function calcPoints($el){
	($el||$('.list')).each(function(){if(this.list)this.list.calc()})
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
window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;

function checkExport() {
	if($('form').find('.js-export-excel').length) return;
	var $js_btn = $('form').find('.js-export-json');
	if($js_btn.length)
		$excel_btn = $('<a>')
			.attr({
				style: 'margin: 0 4px 4px 0;',
				class: 'button js-export-excel',
				href: '#',
				target: '_blank',
				title: 'Open downloaded file with Excel'
			})
			.text('Excel')
			.click(showExcelExport)
			.insertAfter($js_btn);
}

function showExcelExport() {
	$excel_btn.text('Generating...');

	$.getJSON($('form').find('.js-export-json').attr('href'), function(data) {
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

		var bb = new BlobBuilder();
		bb.append(s);
		
		var board_title_reg = /.*\/board\/(.*)\//;
		var board_title_parsed = document.location.href.match(board_title_reg);
		var board_title = board_title_parsed[1];

		$excel_btn
			.text('Excel')
			.after(
				$excel_dl=$('<a>')
					.attr({
						download: board_title + '.xls',
						href: window.URL.createObjectURL(bb.getBlob('application/ms-excel'))
					})
			);

		var evt = document.createEvent('MouseEvents');
		evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
		$excel_dl[0].dispatchEvent(evt);
		$excel_dl.remove()

	});

	return false
};

