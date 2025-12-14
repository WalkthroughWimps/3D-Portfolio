document.addEventListener('DOMContentLoaded', () => {
	const svg = document.querySelector('.head-pic-container svg');
	const headCircle = svg && svg.querySelector('#head-inner');
	const pagesGroup = svg && svg.querySelector('#Pages');
	if (!svg || !headCircle || !pagesGroup) return;

	// Circle geometry in user units
	const cx = parseFloat(headCircle.getAttribute('cx'));
	const cy = parseFloat(headCircle.getAttribute('cy'));
	const r  = parseFloat(headCircle.getAttribute('r'));
	const d  = 2 * r;

	// List of page PNGs
	const sources = [
		'assets/images/Document-Pages/Documents-01.png',
		'assets/images/Document-Pages/Documents-02.png',
		'assets/images/Document-Pages/Documents-03.png',
		'assets/images/Document-Pages/Documents-04.png',
		'assets/images/Document-Pages/Documents-05.png',
		'assets/images/Document-Pages/Documents-06.png',
		'assets/images/Document-Pages/Documents-07.png',
		'assets/images/Document-Pages/Documents-08.png',
	];

	// Utility
	let lastIndex = -1;
	const pickNext = () => {
		const idxs = sources.map((_, i) => i).filter(i => i !== lastIndex);
		const idx = idxs[Math.floor(Math.random() * idxs.length)];
		lastIndex = idx;
		return sources[idx];
	};

		const SCALE = 1.15; // ~15% larger

		function createImage(src) {
		const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
		img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
		img.setAttribute('href', src);
		// Fit nicely inside the circle
		const margin = d * 0.08; // leave edge margin
		const w = d - margin * 2;
		const h = d - margin * 2;
		img.setAttribute('width', w.toFixed(3));
		img.setAttribute('height', h.toFixed(3));
		img.setAttribute('x', (cx - w / 2).toFixed(3));
		img.setAttribute('y', (cy - h / 2).toFixed(3));
		img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
		img.setAttribute('class', 'page');
		img.style.transformOrigin = 'center';
		img.style.transformBox = 'fill-box';
			// Base scale
			img.style.transform = `scale(${SCALE})`;
		return img;
	}

	// Peel animation: overlay a new page under the current, then peel current away
		const INTERVAL_MS = 2500;
		const PEEL_MS =250;
		const FLY_MS = 900;

	let current = null;
		let isAnimating = false;
	function showInitial() {
		const src = pickNext();
		current = createImage(src);
		pagesGroup.appendChild(current);
	}

	function peelOnce() {
			if (!current || isAnimating) return;
			isAnimating = true;
		const next = createImage(pickNext());
		// Insert next beneath current
		if (pagesGroup.firstChild) pagesGroup.insertBefore(next, pagesGroup.firstChild);
		else pagesGroup.appendChild(next);

			// Animate current with a page curl (left -> right), then fly out to the left
		const start = performance.now();

		function tick(now) {
			const t = Math.min(1, (now - start) / PEEL_MS);
			// Ease (cubic)
			const e = 1 - Math.pow(1 - t, 3);
				// Left-to-right peel: rotate counterclockwise, skew left, drift slightly right/up
				const angle = -(10 + 18 * e); // up to ~-28deg
				const sk = -(6 + 6 * e);      // up to ~-12deg
				const tx = (d * 0.12) * e;    // slight translate to right
				const ty = (d * 0.01) * e;    // slight lift
				// Compose transforms around element center using CSS on SVG image (include base scale)
				current.style.transform = `scale(${SCALE}) translate(${tx}px, ${-ty}px) rotate(${angle}deg) skewX(${sk}deg)`;
			if (t < 1) requestAnimationFrame(tick);
			else {
					// Start flight to the left: compute how far to travel to be fully out of view
					const headRect = headCircle.getBoundingClientRect();
					const imgRect = current.getBoundingClientRect();
					// Distance so that the right edge passes the left boundary of the head (plus margin)
					const margin = 16; // px
					const distanceLeft = (imgRect.right - headRect.left) + margin; // positive px
					const flightStart = performance.now();
					const tx0 = tx;
					const ty0 = ty;
					const angle0 = angle;
					const sk0 = sk;
					function fly(now2) {
						const t2 = Math.min(1, (now2 - flightStart) / FLY_MS);
						const e2 = 1 - Math.pow(1 - t2, 3);
						const txFly = tx0 - distanceLeft * e2; // move left
						// Keep visible until fully out; no fade
						current.style.transform = `scale(${SCALE}) translate(${txFly}px, ${-ty0}px) rotate(${angle0}deg) skewX(${sk0}deg)`;
						if (t2 < 1) requestAnimationFrame(fly);
						else {
							if (current.parentNode) current.parentNode.removeChild(current);
							current = next;
							isAnimating = false;
						}
					}
					requestAnimationFrame(fly);
			}
		}
		requestAnimationFrame(tick);
	}

	showInitial();
	setInterval(peelOnce, INTERVAL_MS);
});
