for file in landing/index.html about/index.html docs-site/index.html demo/index.html legal/terms.html legal/privacy.html dashboard/index_new.html dashboard/index.html
do
  # Add the class definition right before </head> if it's not there
  if ! grep -q "\.logo-img" "$file"; then
    sed -i '' 's|</head>|<style>\n.logo-img {\n  height: 44px;\n  width: 44px;\n  vertical-align: middle;\n  margin-right: 8px;\n  filter: drop-shadow(0 0 10px var(--accent-glow, rgba(0, 216, 255, 0.5)));\n  transition: filter 0.3s ease;\n}\n.logo-img:hover {\n  filter: drop-shadow(0 0 15px var(--accent));\n}\n</style>\n</head>|' "$file"
  fi
  # Replace inline styles with the new class
  sed -i '' 's/style="height:44px;width:44px;vertical-align:middle;margin-right:8px"/class="logo-img"/g' "$file"
  sed -i '' 's/style="height:40px;width:40px;vertical-align:middle;margin-right:6px"/class="logo-img"/g' "$file"
  sed -i '' 's/style="height:40px;width:40px;vertical-align:middle"/class="logo-img"/g' "$file"
  sed -i '' 's/style="height:40px;width:40px"/class="logo-img"/g' "$file"
  sed -i '' 's/class="logo-icon" src="\/agentguard-logo/class="logo-img" src="\/agentguard-logo/g' "$file"
done
