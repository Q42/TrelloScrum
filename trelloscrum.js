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
** Changelog
**
** v0.3
** - Now event-driven, much faster response
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
** Bugs:
** - When deleting storypoints, it takes F5 to recalc
**
*/

$(function(){
	//watch filtering
	$('.js-filter-cards').live('DOMSubtreeModified',calcPoints);

	//want: trello events
	(function periodical(){
		$('.list').each(list);
		$('.list-card').each(listCard);
		setTimeout(periodical,1000)
	})();
});

//.list pseudo
function list(e){
	if(this.list)return;
	this.list=true;

	var $list=$(this);
	var $total=$('<span class="scrumTotal">')
		.appendTo($list.find('.list-header h2'));

	this.calc = function(){
		var score=0;
		$list.find('.list-card').each(function(){if(this.points)score+=this.points});
		$total.text(score>0?score:'');
	};
}

//.card-list pseudo
function listCard(e){
	if(this.scrumCard)return;
	this.scrumCard=true;

	var points=-1;
	var that=this;
	var $card=$(this);
	var $badge=$('<span class="badge badge-points point-count">');

	if($card.hasClass('placeholder'))return;

	$card.bind('DOMNodeInserted',function(e){
		var nlist=$(that).closest('.list')[0];
		if(e.target==that&&nlist){
			getPoints();
			printBadge();
		}
	});

	function printBadge(){
		if($(that).parent()[0])$badge.insertBefore($(that).find('.badges').first())
	};

	function getPoints(){
		var $title=$(that).find('.list-card-title a');

		//accepts digits, decimals and question mark
		var parsed=$title.text().replace(/^.*\((\?|\d*\.?\d+)\).*$/,'$1');

		if((!isNaN(Number(parsed))&&parsed>=0)||parsed=='?'){
			points=parsed;
			$badge.text(points);
			$title[0].otitle=$title.text();
			$title.text($title.text().replace(/\((\?|\d*\.?\d+)\)\s?/,''));
		}

		calcPoints();
	};

	this.__defineGetter__('points',function(){
		//don't add to total when filtered out
		var filtered=$('.js-filter-cards').hasClass('is-on');
		return (!filtered||$card.css('opacity')==1)&&points>=0?Number(points):0
	});

	getPoints();
	printBadge();
};

//forcibly calculate list totals
function calcPoints(){
	$('.list').each(function(){if(this.calc)this.calc()})
};
