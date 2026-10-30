(() => {
  const token = location.hash.slice(1), feedback = document.querySelector('#status-feedback');
  const labels = { pending: 'Awaiting review', accepted: 'Accepted', replied: 'Studio replied', rejected: 'Unable to fulfill' };
  async function refresh() {
    const button = document.querySelector('#refresh-status'); button.disabled = true;
    try {
      if (!/^[\w-]{43}$/.test(token)) throw new Error('Open the private link saved after submitting your request.');
      const response = await fetch('/api/order-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to check this request.');
      feedback.textContent = ''; document.querySelector('#status-result').hidden = false;
      const badge = document.querySelector('#status-badge'); badge.className = `badge ${result.status}`; badge.textContent = labels[result.status];
      document.querySelector('#status-title').textContent = result.status === 'pending' ? 'Your request is awaiting review.' : 'An update from the cake studio.';
      document.querySelector('#status-cake').textContent = `${result.cakeLabels?.flavor || CakeOrderOptions.cakes.find(([id]) => id === result.cake.flavor)?.[1] || result.cake.flavor} · ${result.cakeLabels?.size || result.cake.size + '-inch round'}${result.cakeLabels?.icing ? ' · ' + result.cakeLabels.icing : ''}`;
      document.querySelector('#status-date').textContent = `Celebration date: ${new Date(result.date + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'long' })}`;
      document.querySelector('#status-order-document').innerHTML=CakeOrderSheet.renderCompact([result],{imageUrl:(_,i)=>result.images?.[i]});
      document.querySelector('#status-reply').textContent = result.reply || 'Your request is in our review list. Please check this link again for our response.';
      document.querySelector('#status-updated').textContent = `Updated ${new Date(result.updatedAt).toLocaleString()}`;
    } catch (error) { feedback.textContent = error.message; document.querySelector('#status-result').hidden = true; }
    finally { button.disabled = false; }
  }
  document.querySelector('#refresh-status').addEventListener('click', refresh); refresh();
})();
