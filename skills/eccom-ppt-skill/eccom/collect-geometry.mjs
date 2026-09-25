/** Run in the browser after document.fonts.ready, with every slide at 1280x720.
 * Includes unmarked content; author omissions cannot hide it from the gate. */
export function collectGeometry(root = document) {
  return {canvas:{width:1280,height:720},slides:[...root.querySelectorAll('.slide, [data-eccom-role]')].map(slide=>{
    const base=slide.getBoundingClientRect();
    const sx=base.width/1280, sy=base.height/720;
    const relative=r=>({x:(r.left-base.left)/sx,y:(r.top-base.top)/sy,w:r.width/sx,h:r.height/sy});
    const elements=[];
    for(const el of slide.querySelectorAll('*')) {
      const style=getComputedStyle(el), box=el.getBoundingClientRect();
      if(style.display==='none'||style.visibility==='hidden'||box.width===0||box.height===0) continue;
      if(el.parentElement.closest('[data-eccom-slot]')) continue;
      const shell=el.hasAttribute('data-eccom-shell');
      const slot=el.getAttribute('data-eccom-slot');
      const text=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      const painted=style.backgroundColor!=='rgba(0, 0, 0, 0)'||style.backgroundImage!=='none'||['Top','Right','Bottom','Left'].some(side=>parseFloat(style[`border${side}Width`])>0)||style.boxShadow!=='none';
      if(!shell&&!slot&&!text&&!painted&&!['IMG','SVG','CANVAS','VIDEO'].includes(el.tagName)) continue;
      const entry={id:el.id||`element-${elements.length+1}`,rect:relative(box),text:el.textContent,
        fontSize:parseFloat(style.fontSize),fontFamily:style.fontFamily,color:style.color,fontWeight:style.fontWeight,textAlign:style.textAlign,letterSpacing:parseFloat(style.letterSpacing)||0};
      if(slot) {
        entry.slot=slot;
        entry.runs=[];
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          if(!walker.currentNode.textContent.trim()) continue;
          const rs=getComputedStyle(walker.currentNode.parentElement);
          entry.runs.push({text:walker.currentNode.textContent,fontSize:parseFloat(rs.fontSize),fontFamily:rs.fontFamily,color:rs.color,fontWeight:rs.fontWeight,letterSpacing:parseFloat(rs.letterSpacing)||0});
        }
      }
      if(shell) Object.assign(entry,{kind:'shell',src:el.getAttribute('src'),loaded:el.complete&&el.naturalWidth===1280&&el.naturalHeight===720,opacity:parseFloat(style.opacity),filter:style.filter,clipPath:style.clipPath,blendMode:style.mixBlendMode});
      if(text||slot) {
        // Browser Range boxes include font leading/descenders. Visible ink beyond
        // a line box is not clipping; only clipping overflow cuts it off.
        const clipsX=/(hidden|clip|auto|scroll)/.test(style.overflowX);
        const clipsY=/(hidden|clip|auto|scroll)/.test(style.overflowY);
        if(clipsX||clipsY||slot) entry.textMetrics={scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};
        const range=document.createRange();range.selectNodeContents(el);
        let left=box.left,right=box.right,top=box.top,bottom=box.bottom;
        for(const line of range.getClientRects()) {
          if((clipsX&&(line.left<box.left-.5||line.right>box.right+.5))||(clipsY&&(line.top<box.top-.5||line.bottom>box.bottom+.5))) entry.clipped=true;
          left=Math.min(left,line.left);right=Math.max(right,line.right);top=Math.min(top,line.top);bottom=Math.max(bottom,line.bottom);
        }
        if(!slot) entry.rect=relative({left,top,width:right-left,height:bottom-top});
        else if(right>box.right+2||left<box.left-2) entry.clipped=true;

      }
      for(let parent=el.parentElement;parent;parent=parent.parentElement) {
        const ps=getComputedStyle(parent), pr=parent.getBoundingClientRect();
        if(shell && (parseFloat(ps.opacity)!==1||ps.filter!=='none'||ps.clipPath!=='none')) entry.opacity=0;
        if((/(hidden|clip|auto|scroll)/.test(ps.overflowX)&&(box.left<pr.left-.5||box.right>pr.right+.5)) || (/(hidden|clip|auto|scroll)/.test(ps.overflowY)&&(box.top<pr.top-.5||box.bottom>pr.bottom+.5))) entry.clipped=true;
      }
      elements.push(entry);
    }
    return {role:slide.getAttribute('data-eccom-role'),width:slide.offsetWidth,height:slide.offsetHeight,elements};
  })};
}
