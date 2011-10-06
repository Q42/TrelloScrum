//TrelloScrum - https://github.com/marcelduin/TrelloScrum
//Adds Scrum to your Trello
//Project by Jasper Kaizer <jasper@q42.nl> & Marcel Duin <marcel@q42.nl>
function scoreCards(){
    $('div.list').each(function(){
        var list=$(this);
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
                
                // Look for unknown points cards through inclusion of (?) in title
                if(!found){
                    point=title.text().replace(/^.*\((\?)\).*$/,'$1');
                    title.text(title.text().replace(/\((\?)\)\s?/,''));
		    if('?'==point) found=true;
		}
            });
            // If a Point is found whether numeric or unkown add a badge
            if(found)) {
                card.find('.badges').each(function() {
                    var badge='<div class="badge"><span class="app-icon small-icon light point-icon badge-image">P</span><div class="badge-count point-count">'+point+'</div></div>';
                    $(this).append(badge);
                });
            }
        });
    
        var total=0;
        list.find('.point-count').each(function(){
            var point=Number($(this).text());
            if(!isNaN(point)){
                total += point;
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
