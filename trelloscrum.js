//TrelloScrum - https://github.com/marcelduin/TrelloScrum
//Adds Scrum to your Trello
//Project by Jasper Kaizer <jasper@q42.nl> & Marcel Duin <marcel@q42.nl>

function replacePointValue(text, replacement){
    var point = null;

    if (replacement.length > 0){
        replacement = "(" + replacement + ")";
    }

    // regular digits
    match = text.match(/^.*\((\d*\.?\d+)\).*$/);
    if (match != null){
        point = Number(match[1]);
        if (isNaN(point)){
            point = null;
        } else {
            text = text.replace(/\((\d*\.?\d+)\)/, replacement);
        }
    }

    // Unkown card support
    if(point == null){
        match = text.match(/^.*\((\?)\).*$/);
        if (match != null){
            point = '?';
            text = text.replace(/\((\?)\)\s?/, replacement);
        }
    }

    if (replacement.length > 0 && point == null){
        text = text + " " + replacement;
    }

    return [text, point];
}

function scoreCards(){
    var filtered=$('.js-filter-cards').hasClass('is-on');
    $('div.list').each(function(){
        var list=$(this);
        var total=0;
        list.find('.list-card').each(function(){
            var card = $(this);
            var point = null;

            card.find('.list-card-title a').each(function(){
                var title=$(this);
                var result = replacePointValue(title.text(), "");
                title.text(result[0]);
                point = result[1];
            });

            if(point != null){
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

var _editorTitle = [];
var _editControls = [];

function updatePoint(){
    var value = $(this).text();
    var text = $(".card-detail-title .edit textarea").val();
    $(".card-detail-title .edit textarea").remove();

    // replace our new 
    var result = replacePointValue(text, value);
    text = result[0];

    // total hackery to get Trello to acknowledge our new value
    $(".card-detail-title .edit").prepend('<textarea type="text" class="field single-line" style="height: 42px; ">' + text + '</textarea>');

    // then click our button so it all gets saved away
    $(".card-detail-title .edit .js-save-edit").click();
}

$(function periodical(){
    scoreCards();

    if ($(".card-detail-title .edit-controls").length > 0  && $(".card-detail-title .edit-controls .picker").length == 0){
        var pickers = "";
        pickers += '<span class="point-value">?</span> ';
        pickers += '<span class="point-value">.5</span> ';
        for (var i=1; i<=10; i++){
            pickers += '<span class="point-value">' + i + '</span> ';
        }
        var picker = "<div class='picker'>" + pickers + "</div>";
        $(".card-detail-title .edit-controls").append(picker);
        $(".point-value").click(updatePoint);
    }

    setTimeout(periodical,1000)
})
