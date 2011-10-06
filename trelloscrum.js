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
                var score=title[0].s||0;
                // added decimal support
                point=Number(title.text().replace(/^.*\((\d*\.?\d+)\).*$/,'$1'));
                if(!isNaN(point)&&point!=score){
                    title.text(title.text().replace(/\(\d*\.?\d+\)\s?/,''))[0].score=score=point;
                    found=true;
                }
            });
            // changed display of points to be a badge rather than in the title.  fixes hiding of points in smaller window view of trello
            if(found && !isNaN(point)) {
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
