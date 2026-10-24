/* Shared customer choices: used by the form, preview, and server validation. */
(function (scope) {
  const options = {
    cakes: [['redVelvet', 'Red velvet'], ['vanilla', 'Vanilla'], ['lemon', 'Lemon'], ['white', 'White cake'], ['chocolate', 'Chocolate'], ['carrot', 'Carrot cake'], ['pistachio', 'Pistachio']],
    fillings: [['none', 'No added pieces'], ['chocolateChips', 'Chocolate chips'], ['candyCoatedChocolate', 'Candy-coated chocolate'], ['almondPieces', 'Almond pieces'], ['walnutPieces', 'Walnut pieces'], ['caramelNutChocolate', 'Caramel nut chocolate'], ['peanutButterCup', 'Peanut butter cup']],
    toppers: [['none', 'None'], ['strawberry', 'Strawberry'], ['blueberries', 'Blueberries'], ['raspberries', 'Raspberries'], ['chocolateChips', 'Chocolate chips'], ['chocolateCurls', 'Chocolate curls'], ['candyCoatedChocolate', 'Candy-coated chocolate'], ['almondPieces', 'Almond pieces'], ['walnutPieces', 'Walnut pieces'], ['caramelNutChocolate', 'Caramel nut chocolate'], ['peanutButterCup', 'Peanut butter cup'], ['rainbowSprinkles', 'Rainbow sprinkles'], ['rosette', 'Rosette'], ['pipedDollop', 'Piped dollop'], ['pipedRuffle', 'Piped ruffle'], ['fondantDisc', 'Fondant disc'], ['fondantRibbon', 'Fondant ribbon']],
    amounts: { light: { label: 'Light', frequency: 0.55, description: 'A little crunch · about half the normal amount' }, normal: { label: 'Normal', frequency: 1, description: 'A balanced scattering throughout' }, extra: { label: 'Extra', frequency: 1.5, description: 'A generous scattering · about 50% more' } },
    icings: [['buttercream', 'Buttercream', '#fff4df'], ['vanillaButtercream', 'Vanilla buttercream', '#fff0cd'], ['strawberryButtercream', 'Strawberry buttercream', '#edb5bc'], ['chocolateButtercream', 'Chocolate buttercream', '#583025'], ['creamCheese', 'Cream cheese frosting', '#fff8e8'], ['whippedCream', 'Whipped cream', '#fffdf5']],
    legacyIcings: [['cream', 'Cream (original color choice)', '#fff4df'], ['chocolate', 'Chocolate (original color choice)', '#583025'], ['blush', 'Blush (original color choice)', '#edb5bc'], ['lavender', 'Lavender (original color choice)', '#c8b4df']],
    sizes: [['6', '6-inch round'], ['8', '8-inch round'], ['10', '10-inch round']],
    allergens: ['Milk', 'Eggs', 'Wheat', 'Soy', 'Peanuts', 'Tree nuts', 'Sesame', 'Fish', 'Shellfish'],
    severities: [['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe'], ['unsure', 'Not sure'], ['noneAtFacility', 'None used at facility']]
  };
  if (typeof module !== 'undefined') module.exports = options;
  else scope.CakeOrderOptions = options;
})(typeof window === 'undefined' ? globalThis : window);
