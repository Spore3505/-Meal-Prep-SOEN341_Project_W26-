module.exports = {
  extends: "stylelint-config-standard",
  rules: {
    "color-function-notation": null,  
    "alpha-value-notation": null, 
    "selector-class-pattern": null,
    "no-descending-specificity": null,
    "selector-id-pattern": null,
    "keyframes-name-pattern":null,
    "media-feature-range-notation": null,
    "declaration-block-no-redundant-longhand-propeties": null
  }
    
  ignoreFiles: [
    "node_modules/**",
    "public/images/**"
  ]
};
