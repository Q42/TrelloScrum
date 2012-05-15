/*
** TrelloScrum v0.54 - https://github.com/Q42/TrelloScrum
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
**
*/

//default story point picker sequence
var _pointSeq = ['?', 0, 1, 2, 3, 5, 8, 13, 20];

//internals
var filtered = false, //watch for filtered cards
	reg = /\((\x3f|\d*\.?\d+)\)\s?/m, //parse regexp- accepts digits, decimals and '?'
	iconUrl = chrome.extension.getURL('images/storypoints-icon.png');

//what to do when DOM loads
$(function(){
	//watch filtering
	$('.js-filter-cards').live('DOMSubtreeModified',function(){
		filtered=$('.js-filter-cards').hasClass('is-on');
		calcPoints()
	});

	//for storypoint picker
	$(".card-detail-title .edit-controls").live('DOMNodeInserted',showPointPicker);
	

	//want: trello events
	(function periodical(){
		$('.list').each(list);
		$('.list-card').each(listCard);
		checkExport();
		setTimeout(periodical,2000)
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
		var scoreTruncated = Math.floor(score * 100) / 100;
		$total.text(scoreTruncated>0?scoreTruncated:'')
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
		busy=false,
		$badge=$('<div class="badge badge-points point-count" style="background-image: url('+iconUrl+')"/>');

	if($card.hasClass('placeholder'))return;

	$card.bind('DOMNodeInserted',function(e){
		if(!busy&&$(e.target).hasClass('list-card-title'))setTimeout(getPoints)
	});

	function getPoints(){
		var $title=$card.find('a.list-card-title');
		if(!$title[0])return;
		busy=true;
		var title=$title.html();
		parsed=($title[0].otitle||title).match(reg);
		points=parsed?parsed[1]:title;
		if(points!=title)$title[0].otitle=title;
		$title.html($title.html().replace(reg,''));
		if($card.parent()[0]){
			$badge.text(that.points).prependTo($card.find('.badges'));
			$badge.attr({title: 'This card has '+that.points+' storypoint' + (that.points == 1 ? '.' : 's.')})
		}
		busy=false;
		calcPoints($card.closest('.list'))
	};

	this.__defineGetter__('points',function(){
		//don't add to total when filtered out
		return parsed&&(!filtered||($card.css('opacity')==1 && $card.css('display')!='none'))?points:''
	});

	getPoints()
};

//forcibly calculate list totals
function calcPoints($el){
	($el||$('.list')).each(function(){if(this.calc)this.calc()})
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
var $excel_btn;
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
	json_url = $('form').find('.js-export-json').attr('href');
	$excel_btn.text('Generating...');

	$.getJSON(json_url, function(data) {
		var s = '<table id="export" border=1>';
		s += '<tr><th>Points</th><th>Story</th><th>Description</th></tr>';
		$.each(data['lists'], function(key, list) {
			list_id = list["id"];
			s += '<tr><th colspan="3">' + list['name'] + '</th></tr>';

			$.each(data["cards"], function(key, card) {
				if (card["idList"] == list_id) {
					title = card["name"];
					parsed = title.match(reg);
					points = parsed?parsed[1]:'';
					title = title.replace(reg,'');
					s += '<tr><td>'+ points + '</td><td>' + title + '</td><td>' + card["desc"] + '</td></tr>';
				}
			});
			s += '<tr><td colspan=3></td></tr>';
		});
		s += '</table>';

		var $link = $('<a class="button js-export-excel" download="Trello.xls" target="_blank">')
		.text('.XLS')
		.attr('href','data:application/ms-excel,'+encodeURIComponent(s))
		.insertAfter($excel_btn);

		$excel_btn.text('Excel');
	});

	return false;
};
