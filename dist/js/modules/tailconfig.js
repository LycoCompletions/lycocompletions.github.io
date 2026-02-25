tailwind.config = {
    theme: {
        extend: {
            colors: {
                cobalt: { 100: '#18383B', 80: '#3D5053', 60: '#616e70', 40: '#8B9295', 20: '#bdbfc1', 10: '#d9dadb' },
                lime: { 100: '#72BF44', 80: '#8fc964', 60: '#aad48a', 40: '#c5e1ae', 20: '#e0efd4', 10: '#eef6e8' },
                bluegum: { 100: '#4F748B', 80: '#6f889d', 60: '#8e9faf', 40: '#afb8c4', 20: '#d0d6db', 10: '#e6e7ea' },
                moss: { 100: '#006C5C', 80: '#3b7f71', 60: '#6b968c', 40: '#94b0aa', 20: '#c4d1ce', 10: '#dfe4e1' }
            },
            screens: {
                'print': { 'raw': 'print' }
            }
        }
    },
    variants: {
        extend: {
            display: ['print'],
        }
    }
};