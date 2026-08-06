import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { searchFoods } from '../services/foodSearch';
import type { SearchResultFood } from '../types/search';

type Props = NativeStackScreenProps<RootStackParamList, 'AddFoodSearch'>;

export function AddFoodSearchScreen({ navigation, route }: Props) {
  const initialMealType = route.params?.initialMealType;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const foods = await searchFoods(query);
      setResults(foods);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search foods (e.g. banana, chicken breast)"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          autoFocus
        />
        <Pressable style={styles.searchButton} onPress={runSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={styles.spinner} />}
      {error && <Text style={styles.error}>{error}</Text>}
      {!loading && searched && results.length === 0 && !error && (
        <Text style={styles.empty}>No results. Try a different search term.</Text>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.source}:${item.sourceId}`}
        renderItem={({ item }) => (
          <Pressable
            style={styles.resultRow}
            onPress={() => navigation.navigate('AddFoodEntry', { food: item, initialMealType })}
          >
            <View style={styles.resultText}>
              <Text style={styles.resultName}>{item.name}</Text>
              <Text style={styles.resultMeta}>
                {item.brand ? `${item.brand} · ` : ''}
                {Math.round(item.calories)} kcal / {item.referenceAmount}
                {item.referenceUnit} · {item.source === 'usda' ? 'USDA' : 'Open Food Facts'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: { color: 'white', fontWeight: '600' },
  spinner: { marginTop: 20 },
  error: { color: '#dc2626', textAlign: 'center', marginTop: 12 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 20 },
  resultRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  resultText: { gap: 2 },
  resultName: { fontSize: 16, fontWeight: '500' },
  resultMeta: { fontSize: 13, color: '#6b7280' },
});
