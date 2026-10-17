// Rulează înainte de afișare: activează stilurile pentru JS și preferința „Reduce animațiile”.
document.documentElement.classList.add('js');
try {
  if (localStorage.getItem('seecode_motion') === 'reduce') document.documentElement.classList.add('reduce-motion');
} catch (e) {
  /* stocarea poate fi blocată de browser */
}
