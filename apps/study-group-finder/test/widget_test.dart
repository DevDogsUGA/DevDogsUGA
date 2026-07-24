import 'package:flutter_test/flutter_test.dart';
import 'package:study_group_finder/main.dart';

void main() {
  testWidgets('renders the placeholder home screen', (tester) async {
    await tester.pumpWidget(const StudyGroupFinderApp());
    expect(find.text('DevDogs Study Group Finder'), findsOneWidget);
  });
}
