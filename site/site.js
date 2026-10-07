// The site's page: the deck over the curtain.
import { deck } from "./deck.js";

deck({ slides: [...document.querySelectorAll(".slide")], dots: [...document.querySelectorAll(".dots button")] });
