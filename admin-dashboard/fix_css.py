import sys

with open('src/App.css', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# The bad text starts at '. p a g i n a t i o n' which is due to UTF-16
# Let's find the closing brace of domain-select:disabled
idx = content.find('.domain-select:disabled {')
if idx != -1:
    end_idx = content.find('}', idx)
    if end_idx != -1:
        clean_content = content[:end_idx + 1] + '\n\n'
        
        # Append the new pure CSS
        clean_content += '''
.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  margin-top: 1rem;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.05);
}

.pagination button {
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  background: var(--primary);
  color: white;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination select {
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius);
}
'''
        with open('src/App.css', 'w', encoding='utf-8') as out:
            out.write(clean_content)
        print("Fixed App.css successfully.")
    else:
        print("Could not find closing brace.")
else:
    print("Could not find domain-select:disabled block.")
