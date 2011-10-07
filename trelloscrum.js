//TrelloScrum - https://github.com/marcelduin/TrelloScrum
//Adds Scrum to your Trello
//Project by Jasper Kaizer <jasper@q42.nl> & Marcel Duin <marcel@q42.nl>

function showPicker(badge){

}

function scoreCards(){
    var filtered=$('.js-filter-cards').hasClass('is-on');
    $('div.list').each(function(){
        var list=$(this);
        var total=0;
        list.find('.list-card').each(function(){
            var card = $(this);
            var point = 0;
            var found =false;
            card.find('.list-card-title a').each(function(){
                var title=$(this);
                point=Number(title.text().replace(/^.*\((\d*\.?\d+)\).*$/,'$1'));
                if(!isNaN(point)){
                    title.text(title.text().replace(/\(\d*\.?\d+\)\s?/,''));
                    found=true;
                }
		// Unkown card support
		if(!found){
                    point=title.text().replace(/^.*\((\?)\).*$/,'$1');
                    title.text(title.text().replace(/\((\?)\)\s?/,''));
		    if('?'==point) found=true;
		}

            });
            if(found) {
                card.find('.badges').each(function() {
                    var badge='<div class="badge badge-points point-count" onclick="javascript:showPicker(this);">'+point+'</div>';
                    $(this).append(badge);
                });
            }

	    if(!filtered || (card.css('opacity')==1)){
	        card.find('.point-count').each(function(){
                    var point=Number($(this).text());
                    if(!isNaN(point)){
                        total += point;
                    }
                });
	    }
	});


        var _=list.find('.tot');
        if(!_[0])_=$('<span class="tot">').insertBefore(list.find('.list-header h2'));
        _.text(total>0?total:'')
    });
}

$(function periodical(){
    scoreCards();
    setTimeout(periodical,1000)
})

$(document).ready(function() {
    var pickers = "";
    for (var i=0; i<=5; i++){
        pickers += '<span class="point-value">' + i + '</span> ';
    }
    var picker = "<div id='point-picker'>" + pickers + "</div>";
    $("body").append(picker);
});