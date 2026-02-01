---
name: note
fields:
  title:
    type: string
    required: true
  tags:
    type: list
    items:
      type: string
  rating:
    type: integer
    min: 1
    max: 5
  related:
    type: link
---
