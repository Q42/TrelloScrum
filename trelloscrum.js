//TrelloScrum - https://github.com/marcelduin/TrelloScrum
//Adds Scrum to your Trello
//Project by Jasper Kaizer <jasper@q42.nl> & Marcel Duin <marcel@q42.nl>
function scoreCards(){
	$('div.list').each(function(){
		var list=$(this);
		var totalPoints=0;
		list.find('.list-card-title a').each(function(){
			var title=$(this);
			var score=title[0].score||0;
			var points=Number(title.text().replace(/^.*\((\d+)\).*$/,'$1'));
			if(!isNaN(points)&&points!=score){
				title.text(title.text().replace(/\(\d+\)\s?/,''))[0].score=score=points;
				var _subtotal=title.prev('.subTotal');
				if(!_subtotal[0])_subtotal=$('<span class="subTotal">').insertBefore(title);
				_subtotal.text(score>0?score:'')
			}
			totalPoints+=score
		});
		var _total=list.find('.totalScore');
		if(!_total[0])_total=$('<span class="totalScore">').insertBefore(list.find('.list-header h2'));
		_total.text(totalPoints>0?totalPoints:'')
	})
}
$(function periodical(){
	scoreCards();
	setTimeout(periodical,1000)
})
