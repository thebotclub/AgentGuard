#!/bin/bash

echo "Fixing logo size..."
find . -name "*.html" -type f -not -path "*/node_modules/*" -not -path "*/\.git/*" | while read -r file; do
  # Adjust logo-img css
  sed -i '' 's/height: 44px;/height: 32px;/g' "$file"
  sed -i '' 's/width: 44px;/width: 32px;/g' "$file"
  sed -i '' 's/margin-right: 8px;//g' "$file"
  sed -i '' 's/width="44" height="44"/width="32" height="32"/g' "$file"
  
  # Add OpenClaw to keywords
  sed -i '' 's/CrewAI security"/CrewAI security, OpenClaw security"/g' "$file"
  
  # Add OpenClaw badge
  sed -i '' 's/<span class="fw-badge active">🚢 CrewAI<\/span>/<span class="fw-badge active">🚢 CrewAI<\/span>\n          <span class="fw-badge active">🐾 OpenClaw<\/span>/g' "$file"
  
  # Replace prose
  sed -i '' 's/LangChain, CrewAI, AutoGen, or any/LangChain, CrewAI, AutoGen, OpenClaw, or any/g' "$file"
  sed -i '' 's/LangChain + CrewAI stack/LangChain + CrewAI + OpenClaw stack/g' "$file"
  sed -i '' 's/LangChain, AutoGen, CrewAI, OpenAI Assistants/LangChain, AutoGen, CrewAI, OpenClaw, OpenAI Assistants/g' "$file"
  sed -i '' 's/LangChain, AutoGen, CrewAI, and custom/LangChain, OpenClaw, CrewAI, AutoGen, and custom/g' "$file"
  sed -i '' 's/LangChain, CrewAI, AutoGen, and OpenAI framework/LangChain, CrewAI, OpenClaw, AutoGen, and OpenAI framework/g' "$file"
  sed -i '' 's/LangChain, CrewAI, and AutoGen/LangChain, CrewAI, OpenClaw, and AutoGen/g' "$file"
  sed -i '' 's/LangChain, OpenAI, CrewAI, or Express/LangChain, OpenAI, CrewAI, OpenClaw, or Express/g' "$file"
  sed -i '' 's/LangChain, CrewAI, AutoGen, OpenAI/LangChain, CrewAI, AutoGen, OpenClaw, OpenAI/g' "$file"
done

echo "Done."
