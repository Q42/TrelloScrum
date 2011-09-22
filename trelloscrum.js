//alert('jQ:'+$);
$(function(){
	var to;
	function periodical() {
		clearTimeout(to);
		parseCards();
		to=setTimeout(periodical,1000);
	};
	function parseCards() {
		$('div.list').each(function(){
			var totalPoints=0;
			var _total=$(this).find('.totalScore')[0]?$(this).find('.totalScore'):$('<span class="totalScore">');
			$(this).find('.list-card-title a').each(function(){
				var points=Number($(this).text().replace(/^.*\((\d+)\).*$/,'$1'));
				var cp=false;
				if(isNaN(points))points=Number($(this).prev('span').text().replace(/^.*\((\d+)\).*$/,'$1'));
				else cp=true;
				if(!isNaN(points)&&points>0){
					var _subtotal=$(this).prev('span')[0]?$(this).prev('span'):$('<span class="subTotal">');
					$(this).before(_subtotal.text(points));
					if(cp)$(this).text($(this).text().replace(/\(\d+\)\s?/,''));
					totalPoints+=points;
				}
			});
			if(totalPoints>0)$(this).find('.list-header h2').after(_total.text(totalPoints));
		});
	};
	periodical();
});

